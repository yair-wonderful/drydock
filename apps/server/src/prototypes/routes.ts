import type { Sql } from "postgres";
import {
	asRecord,
	getOptionalBoolean,
	getOptionalString,
	getRequiredFiles,
	getRequiredString,
} from "../http/body.ts";
import { Router } from "../http/router.ts";
import { withRoute } from "../http/respond.ts";
import {
	createPrototype,
	deletePrototype,
	findPrototype,
	findVersion,
	forkPrototype,
	listPrototypes,
	listVersions,
	publishVersion,
	updatePrototype,
	type Prototype,
} from "./store.ts";

/**
 * A prototype plus its active version's source, which is the shape a reader
 * actually wants: open the library entry, see what it currently renders, in
 * one round trip.
 */
const getPrototypeWithActiveVersion = async (sql: Sql, prototype: Prototype) => {
	if (!prototype.activeVersionId) {
		return { ...prototype, activeVersion: null };
	}
	const version = await findVersion(sql, prototype.id, prototype.activeVersionId);
	return { ...prototype, activeVersion: version };
};

/**
 * Registers the prototype endpoints on `router`.
 *
 * Every mutating route requires `author` in the JSON body. There is no auth
 * layer yet — this is an internal tool with one Postgres and no tenants — so
 * `author` is the caller's own claim about who they are rather than a verified
 * identity. That is an acceptable gap for a company-internal prototyping tool
 * and a real one the moment this is exposed beyond it; tracked as a known gap,
 * not a silent one.
 */
export const registerPrototypeRoutes = (router: Router, sql: Sql): void => {
	router.get(
		"/api/prototypes",
		withRoute(async (req) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const includeArchived = url.searchParams.get("includeArchived") === "true";
			return { prototypes: await listPrototypes(sql, includeArchived) };
		}),
	);

	router.get(
		"/api/prototypes/:id",
		withRoute(async (_req, params) => {
			const prototype = await findPrototype(sql, params.id);
			return getPrototypeWithActiveVersion(sql, prototype);
		}),
	);

	router.post(
		"/api/prototypes",
		withRoute(async (_req, _params, body) => {
			const record = asRecord(body);
			const prototype = await createPrototype(sql, {
				name: getRequiredString(record, "name"),
				author: getRequiredString(record, "author"),
				files: getRequiredFiles(record),
				summary: getOptionalString(record, "summary"),
				entryPoint: getOptionalString(record, "entryPoint"),
				label: getOptionalString(record, "label"),
			});
			return getPrototypeWithActiveVersion(sql, prototype);
		}),
	);

	router.put(
		"/api/prototypes/:id",
		withRoute(async (_req, params, body) => {
			const record = asRecord(body);
			return updatePrototype(sql, params.id, {
				name: getOptionalString(record, "name"),
				summary: getOptionalString(record, "summary"),
				isArchived: getOptionalBoolean(record, "isArchived"),
			});
		}),
	);

	router.delete(
		"/api/prototypes/:id",
		withRoute(async (_req, params) => {
			await deletePrototype(sql, params.id);
			return undefined;
		}),
	);

	// A fork creates a new prototype owned by the caller, so it needs only the
	// author making the copy — not edit rights on the original. Building on
	// someone's work must not require the right to rewrite theirs.
	router.post(
		"/api/prototypes/:id/fork",
		withRoute(async (_req, params, body) => {
			const record = asRecord(body);
			const fork = await forkPrototype(sql, params.id, {
				author: getRequiredString(record, "author"),
				name: getOptionalString(record, "name"),
				versionId: getOptionalString(record, "versionId"),
			});
			return getPrototypeWithActiveVersion(sql, fork);
		}),
	);

	router.post(
		"/api/prototypes/:id/versions",
		withRoute(async (_req, params, body) => {
			const record = asRecord(body);
			return publishVersion(sql, params.id, {
				author: getRequiredString(record, "author"),
				files: getRequiredFiles(record),
				entryPoint: getOptionalString(record, "entryPoint"),
				label: getOptionalString(record, "label"),
			});
		}),
	);

	// Metadata only — the content route below is where a tree is actually read,
	// so the history list stays cheap even for a prototype with many versions.
	router.get(
		"/api/prototypes/:id/versions",
		withRoute(async (_req, params) => ({ versions: await listVersions(sql, params.id) })),
	);

	router.get(
		"/api/prototypes/:id/versions/:versionId",
		withRoute(async (_req, params) => findVersion(sql, params.id, params.versionId)),
	);
};
