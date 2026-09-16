/**
 * Integration tests for the HTTP surface, against a real server and real
 * Postgres. A route test that mocks the store proves the route calls the
 * mock correctly and nothing about whether a real request reaches the real
 * handler — routing bugs live exactly in the part a mock skips.
 *
 * Set DRYDOCK_TEST_DATABASE_URL to run; skips loudly otherwise, matching
 * store.test.ts.
 */

import assert from "node:assert/strict";
import { type Server, createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import type { Sql } from "postgres";
import { createSql } from "../db/connect.ts";
import { migrate } from "../db/migrate.ts";
import { Router } from "./router.ts";
import { registerPrototypeRoutes } from "../prototypes/routes.ts";

const ADMIN_URL = process.env.DRYDOCK_TEST_DATABASE_URL;
const DB_NAME = `drydock_http_test_${process.pid}`;

let admin: Sql;
let sql: Sql;
let server: Server;
let baseUrl: string;

type JsonResponse = { status: number; body: unknown };

const request = async (
	method: string,
	path: string,
	body?: unknown,
): Promise<JsonResponse> => {
	const response = await fetch(`${baseUrl}${path}`, {
		method,
		headers: body === undefined ? {} : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	return { status: response.status, body: text === "" ? undefined : JSON.parse(text) };
};

describe("prototype HTTP routes", { skip: ADMIN_URL ? false : "DRYDOCK_TEST_DATABASE_URL is not set" }, () => {
	before(async () => {
		admin = createSql(ADMIN_URL as string);
		await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
		await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
		sql = createSql(new URL(`/${DB_NAME}`, ADMIN_URL as string).toString());
		await migrate(sql);

		const router = new Router();
		registerPrototypeRoutes(router, sql);
		server = createServer((req, res) => {
			void router.handle(req, res);
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		if (address === null || typeof address === "string") {
			throw new Error("server did not bind to a port");
		}
		baseUrl = `http://127.0.0.1:${address.port}`;
	});

	after(async () => {
		await new Promise((resolve) => server.close(resolve));
		await sql?.end();
		await admin?.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
		await admin?.end();
	});

	it("creates a prototype over HTTP and reads it back with its active version", async () => {
		const created = await request("POST", "/api/prototypes", {
			name: "Escalations board",
			author: "designer@wonderful.ai",
			files: [{ path: "App.tsx", contents: "export default function App() {}" }],
		});
		assert.equal(created.status, 200);
		const prototype = created.body as { id: string; activeVersion: { files: unknown[] } };
		assert.ok(prototype.id);
		assert.equal(prototype.activeVersion.files.length, 1);

		const fetched = await request("GET", `/api/prototypes/${prototype.id}`);
		assert.equal(fetched.status, 200);
	});

	it("maps an invalid tree to 400 with the validation code, not a 500", async () => {
		const result = await request("POST", "/api/prototypes", {
			name: "Bad entry point",
			author: "designer@wonderful.ai",
			files: [{ path: "Board.tsx", contents: "x" }],
		});
		assert.equal(result.status, 400);
		const body = result.body as { error: { code: string } };
		assert.equal(body.error.code, "entry_point_missing");
	});

	it("maps a missing prototype to 404, not a thrown 500", async () => {
		const result = await request("GET", "/api/prototypes/00000000-0000-0000-0000-000000000000");
		assert.equal(result.status, 404);
		assert.equal((result.body as { error: { code: string } }).error.code, "prototype_not_found");
	});

	it("requires author on a mutating route and refuses before touching the store", async () => {
		const result = await request("POST", "/api/prototypes", {
			name: "No author",
			files: [{ path: "App.tsx", contents: "x" }],
		});
		assert.equal(result.status, 400);
		assert.equal((result.body as { error: { code: string } }).error.code, "missing_field");
	});

	it("rejects a request body that is not an object", async () => {
		const result = await request("POST", "/api/prototypes", "just a string");
		assert.equal(result.status, 400);
	});

	it("returns malformed JSON as 400, not a crash", async () => {
		const response = await fetch(`${baseUrl}/api/prototypes`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{not json",
		});
		assert.equal(response.status, 400);
		const body = (await response.json()) as { error: { code: string } };
		assert.equal(body.error.code, "invalid_json");
	});

	it("publishes a version and forks over HTTP, matching the store-level guarantees", async () => {
		const created = await request("POST", "/api/prototypes", {
			name: "Iterating",
			author: "designer@wonderful.ai",
			files: [{ path: "App.tsx", contents: "v1" }],
		});
		const prototypeId = (created.body as { id: string }).id;

		const published = await request("POST", `/api/prototypes/${prototypeId}/versions`, {
			author: "designer@wonderful.ai",
			files: [{ path: "App.tsx", contents: "v2" }],
		});
		assert.equal(published.status, 200);
		assert.equal((published.body as { versionNumber: number }).versionNumber, 2);

		const forked = await request("POST", `/api/prototypes/${prototypeId}/fork`, {
			author: "pm@wonderful.ai",
		});
		assert.equal(forked.status, 200);
		const fork = forked.body as { id: string; forkedFromPrototypeId: string; activeVersion: { files: { contents: string }[] } };
		assert.equal(fork.forkedFromPrototypeId, prototypeId);
		assert.equal(fork.activeVersion.files[0].contents, "v2");
	});

	it("returns 404 for a route that does not exist", async () => {
		const result = await request("GET", "/api/nope");
		assert.equal(result.status, 404);
	});

	it("deletes a prototype and returns 204 with no body", async () => {
		const created = await request("POST", "/api/prototypes", {
			name: "Disposable",
			author: "designer@wonderful.ai",
			files: [{ path: "App.tsx", contents: "x" }],
		});
		const id = (created.body as { id: string }).id;

		const response = await fetch(`${baseUrl}/api/prototypes/${id}`, { method: "DELETE" });
		assert.equal(response.status, 204);
		assert.equal(await response.text(), "");

		const gone = await request("GET", `/api/prototypes/${id}`);
		assert.equal(gone.status, 404);
	});
});
