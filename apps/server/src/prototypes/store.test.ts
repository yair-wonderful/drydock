/**
 * Integration tests against a real PostgreSQL.
 *
 * Real, not a fake, on purpose. The controller version of this feature had a
 * bug that compiled, vetted and linted clean and failed 15 of 16 cases the
 * instant it met an actual database — the JSONB column rejected the value the
 * driver sent. Nothing short of executing against Postgres finds that class of
 * defect, so the suite that matters most here is this one.
 *
 * Set DRYDOCK_TEST_DATABASE_URL to a server it may create and drop databases on.
 * Skips loudly rather than passing vacuously when it is unset.
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Sql } from "postgres";
import { createSql } from "../db/connect.ts";
import { migrate } from "../db/migrate.ts";
import {
	InvalidTreeError,
	PrototypeNotFoundError,
	VersionNotFoundError,
	createPrototype,
	deletePrototype,
	findPrototype,
	findVersion,
	forkPrototype,
	listPrototypes,
	listVersions,
	publishVersion,
	updatePrototype,
} from "./store.ts";

const ADMIN_URL = process.env.DRYDOCK_TEST_DATABASE_URL;
const DB_NAME = `drydock_test_${process.pid}`;

const file = (path: string, contents = "x") => ({ path, contents });
const AUTHOR = "designer@wonderful.ai";

let admin: Sql;
let sql: Sql;

describe("prototype store", { skip: ADMIN_URL ? false : "DRYDOCK_TEST_DATABASE_URL is not set" }, () => {
	before(async () => {
		admin = createSql(ADMIN_URL as string);
		await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
		await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
		sql = createSql(new URL(`/${DB_NAME}`, ADMIN_URL as string).toString());
		await migrate(sql);
	});

	after(async () => {
		await sql?.end();
		await admin?.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
		await admin?.end();
	});

	const create = (name: string, files = [file("App.tsx", "v1")]) =>
		createPrototype(sql, { name, author: AUTHOR, files });

	it("creates a prototype and its first version atomically", async () => {
		const prototype = await create("Escalations board", [
			file("App.tsx", "export default function App() { return <Board /> }"),
			file("components/Board.tsx", "export default function Board() { return null }"),
		]);

		// No empty-prototype state: create returns something that already has an
		// active version, which is what lets every reader skip a nil check.
		assert.ok(prototype.activeVersionId);
		const version = await findVersion(sql, prototype.id, prototype.activeVersionId);
		assert.equal(version.versionNumber, 1);
		assert.equal(version.entryPoint, "App.tsx");
		assert.equal(version.fileCount, 2);
		// The JSONB round trip is the thing that broke last time.
		assert.deepEqual(version.files.map((entry) => entry.path), [
			"App.tsx",
			"components/Board.tsx",
		]);
		assert.equal(version.files[1].contents, "export default function Board() { return null }");
	});

	it("rolls the whole create back when the tree is invalid", async () => {
		await assert.rejects(
			() => createPrototype(sql, { name: "Never stored", author: AUTHOR, files: [file("Board.tsx")] }),
			InvalidTreeError,
		);
		const listed = await listPrototypes(sql, true);
		assert.equal(
			listed.some((entry) => entry.name === "Never stored"),
			false,
			"a rejected create must leave nothing behind",
		);
	});

	it("numbers versions monotonically and keeps history readable", async () => {
		const prototype = await create("Iterating");

		const second = await publishVersion(sql, prototype.id, {
			files: [file("App.tsx", "v2")],
			author: AUTHOR,
			label: "second pass",
		});
		assert.equal(second.versionNumber, 2);
		assert.equal(second.label, "second pass");

		const third = await publishVersion(sql, prototype.id, {
			files: [file("App.tsx", "v3")],
			author: AUTHOR,
		});
		assert.equal(third.versionNumber, 3);

		const reloaded = await findPrototype(sql, prototype.id);
		assert.equal(reloaded.activeVersionId, third.id);

		// Superseded versions stay readable — publishing is append-only, which is
		// the whole reason "open the one I demoed on Tuesday" is a lookup.
		const history = await listVersions(sql, prototype.id);
		assert.deepEqual(history.map((entry) => entry.versionNumber), [3, 2, 1]);
		const first = await findVersion(sql, prototype.id, history[2].id);
		assert.equal(first.files[0].contents, "v1");
	});

	it("allocates distinct version numbers under concurrent publishes", async () => {
		const prototype = await create("Contended");

		// The row lock is the mechanism; this is the test that would catch its
		// absence. Without it both readers see MAX=1 and the unique index rejects
		// one of them.
		const results = await Promise.all(
			["a", "b", "c"].map((mark) =>
				publishVersion(sql, prototype.id, { files: [file("App.tsx", mark)], author: AUTHOR }),
			),
		);

		const numbers = results.map((version) => version.versionNumber).sort();
		assert.deepEqual(numbers, [2, 3, 4], "concurrent publishes must not collide or skip");
	});

	it("omits trees from the history list", async () => {
		const prototype = await create("Heavy", [file("App.tsx", "a big source tree")]);
		const [entry] = await listVersions(sql, prototype.id);
		// The list reports the shape but must never carry the tree.
		assert.equal(entry.fileCount, 1);
		assert.equal(entry.totalBytes, "a big source tree".length);
		assert.equal("files" in entry, false);
	});

	it("forks by copying the tree, not referencing it", async () => {
		const original = await create("Original", [file("App.tsx", "original source")]);
		const fork = await forkPrototype(sql, original.id, { author: "pm@wonderful.ai" });

		assert.notEqual(fork.id, original.id);
		assert.equal(fork.name, "Original (copy)");
		assert.equal(fork.forkedFromPrototypeId, original.id);
		assert.equal(fork.forkedFromVersionId, original.activeVersionId);

		// A fork restarts its own history at v1 — a new object that remembers
		// where it came from, not a branch of the original.
		const forkVersion = await findVersion(sql, fork.id, fork.activeVersionId as string);
		assert.equal(forkVersion.versionNumber, 1);
		assert.equal(forkVersion.files[0].contents, "original source");

		// Moving the original on does not move the fork.
		await publishVersion(sql, original.id, {
			files: [file("App.tsx", "rewritten")],
			author: AUTHOR,
		});
		const reloaded = await findVersion(sql, fork.id, fork.activeVersionId as string);
		assert.equal(reloaded.files[0].contents, "original source");
	});

	it("keeps a fork alive after its origin is deleted", async () => {
		const original = await create("Doomed", [file("App.tsx", "worth keeping")]);
		const fork = await forkPrototype(sql, original.id, { name: "Kept", author: AUTHOR });

		await deletePrototype(sql, original.id);

		// The lineage columns are deliberately not foreign keys: deleting the
		// origin must neither cascade into the fork nor be blocked by it.
		const survivor = await findVersion(sql, fork.id, fork.activeVersionId as string);
		assert.equal(survivor.files[0].contents, "worth keeping");
		const reloaded = await findPrototype(sql, fork.id);
		assert.equal(reloaded.forkedFromPrototypeId, original.id);
	});

	it("refuses to fork a version belonging to another prototype", async () => {
		const a = await create("A", [file("App.tsx", "a")]);
		const b = await create("B", [file("App.tsx", "b")]);

		// The version lookup is scoped by prototype_id, so a valid id from a
		// different prototype is not a way to graft one tree onto another.
		await assert.rejects(
			() => forkPrototype(sql, a.id, { versionId: b.activeVersionId as string, author: AUTHOR }),
			VersionNotFoundError,
		);
	});

	it("forks an older version when asked", async () => {
		const original = await create("Two takes", [file("App.tsx", "v1")]);
		const firstVersionId = original.activeVersionId as string;
		await publishVersion(sql, original.id, { files: [file("App.tsx", "v2")], author: AUTHOR });

		const fork = await forkPrototype(sql, original.id, { versionId: firstVersionId, author: AUTHOR });
		const version = await findVersion(sql, fork.id, fork.activeVersionId as string);
		assert.equal(version.files[0].contents, "v1");
		assert.equal(fork.forkedFromVersionId, firstVersionId);
	});

	it("deletes version history with the prototype", async () => {
		const prototype = await create("Disposable");
		await deletePrototype(sql, prototype.id);

		const [{ count }] = await sql<{ count: string }[]>`
			SELECT COUNT(*)::text AS count FROM prototype_versions WHERE prototype_id = ${prototype.id}
		`;
		assert.equal(count, "0");
	});

	it("hides archived prototypes unless asked", async () => {
		const prototype = await create("Old idea");
		await updatePrototype(sql, prototype.id, { isArchived: true });

		const visible = await listPrototypes(sql);
		assert.equal(visible.some((entry) => entry.id === prototype.id), false);

		const all = await listPrototypes(sql, true);
		assert.equal(all.some((entry) => entry.id === prototype.id), true);
	});

	it("rejects an oversized tree before it reaches the column", async () => {
		await assert.rejects(
			() =>
				createPrototype(sql, {
					name: "Too big",
					author: AUTHOR,
					files: [file("App.tsx", "a".repeat(2 * 1024 * 1024 + 1))],
				}),
			InvalidTreeError,
		);
	});

	it("reports a missing prototype rather than returning nothing", async () => {
		await assert.rejects(
			() => findPrototype(sql, "00000000-0000-0000-0000-000000000000"),
			PrototypeNotFoundError,
		);
	});
});
