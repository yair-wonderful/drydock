import {
	type PrototypeFile,
	type PrototypeValidationError,
	validateFileTree,
} from "@drydock/prototype";
import type { Sql } from "postgres";

export type Prototype = {
	id: string;
	name: string;
	summary: string;
	author: string;
	activeVersionId: string | null;
	forkedFromPrototypeId: string | null;
	forkedFromVersionId: string | null;
	isArchived: boolean;
	createdAt: Date;
	updatedAt: Date;
};

/** A version without its tree. The history list shows the shape of each version
 * and must not drag every tree out of the database to do it. */
export type VersionSummary = {
	id: string;
	prototypeId: string;
	versionNumber: number;
	entryPoint: string;
	fileCount: number;
	totalBytes: number;
	label: string;
	createdBy: string;
	createdAt: Date;
};

export type Version = VersionSummary & { files: PrototypeFile[] };

export class PrototypeNotFoundError extends Error {
	constructor(id: string) {
		super(`prototype ${id} not found`);
		this.name = "PrototypeNotFoundError";
	}
}

export class VersionNotFoundError extends Error {
	constructor(id: string) {
		super(`version ${id} not found`);
		this.name = "VersionNotFoundError";
	}
}

export class InvalidTreeError extends Error {
	readonly detail: PrototypeValidationError;
	constructor(detail: PrototypeValidationError) {
		super(detail.message);
		this.name = "InvalidTreeError";
		this.detail = detail;
	}
}

/** Columns for a version WITHOUT its tree. Spelled out rather than `SELECT *`
 * so adding a column cannot accidentally start shipping trees to the list. */
const VERSION_SUMMARY_COLUMNS =
	"id, prototype_id, version_number, entry_point, file_count, total_bytes, label, created_by, created_at";

type PrototypeRow = {
	id: string;
	name: string;
	summary: string;
	author: string;
	active_version_id: string | null;
	forked_from_prototype_id: string | null;
	forked_from_version_id: string | null;
	is_archived: boolean;
	created_at: Date;
	updated_at: Date;
};

type VersionRow = {
	id: string;
	prototype_id: string;
	version_number: number;
	entry_point: string;
	file_count: number;
	total_bytes: number;
	label: string;
	created_by: string;
	created_at: Date;
	files?: PrototypeFile[];
};

const getPrototype = (row: PrototypeRow): Prototype => ({
	id: row.id,
	name: row.name,
	summary: row.summary,
	author: row.author,
	activeVersionId: row.active_version_id,
	forkedFromPrototypeId: row.forked_from_prototype_id,
	forkedFromVersionId: row.forked_from_version_id,
	isArchived: row.is_archived,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const getVersionSummary = (row: VersionRow): VersionSummary => ({
	id: row.id,
	prototypeId: row.prototype_id,
	versionNumber: row.version_number,
	entryPoint: row.entry_point,
	fileCount: row.file_count,
	totalBytes: row.total_bytes,
	label: row.label,
	createdBy: row.created_by,
	createdAt: row.created_at,
});

const getVersion = (row: VersionRow): Version => ({
	...getVersionSummary(row),
	files: row.files ?? [],
});

export type CreateInput = {
	name: string;
	summary?: string;
	author: string;
	files: readonly PrototypeFile[];
	entryPoint?: string;
	label?: string;
};

export type PublishInput = {
	files: readonly PrototypeFile[];
	entryPoint?: string;
	label?: string;
	author: string;
};

export type ForkInput = {
	/** Defaults to "<original name> (copy)". */
	name?: string;
	/** Defaults to the original's active version, which is what "remix this"
	 * means from the reader's point of view. */
	versionId?: string;
	author: string;
};

/**
 * Appends a version and returns it. MUST run inside a transaction that has
 * already taken a row lock on the parent.
 *
 * The number is derived from the current maximum, so two concurrent publishes
 * have to be serialized by that lock; the unique (prototype_id, version_number)
 * index is the backstop if the discipline ever slips.
 */
const appendVersion = async (
	tx: Sql,
	prototypeId: string,
	files: readonly PrototypeFile[],
	entryPoint: string,
	label: string,
	author: string,
): Promise<Version> => {
	const validated = validateFileTree(files, entryPoint);
	if (!validated.ok) {
		throw new InvalidTreeError(validated.error);
	}

	const [{ next }] = await tx<{ next: number }[]>`
		SELECT COALESCE(MAX(version_number), 0) + 1 AS next
		FROM prototype_versions
		WHERE prototype_id = ${prototypeId}
	`;

	const [row] = await tx<VersionRow[]>`
		INSERT INTO prototype_versions
			(prototype_id, version_number, files, entry_point, file_count, total_bytes, label, created_by)
		VALUES (
			${prototypeId},
			${next},
			${tx.json(validated.value.files as PrototypeFile[])},
			${validated.value.entryPoint},
			${validated.value.files.length},
			${validated.value.totalBytes},
			${label},
			${author}
		)
		RETURNING *
	`;
	return getVersion(row);
};

/** Locks the prototype row for the rest of the transaction, or throws if it is
 * gone. Every version write goes through here. */
const lockPrototype = async (tx: Sql, id: string): Promise<PrototypeRow> => {
	const [row] = await tx<PrototypeRow[]>`
		SELECT * FROM prototypes WHERE id = ${id} FOR UPDATE
	`;
	if (!row) {
		throw new PrototypeNotFoundError(id);
	}
	return row;
};

export const createPrototype = async (sql: Sql, input: CreateInput): Promise<Prototype> => {
	const name = input.name.trim();
	if (name === "") {
		throw new InvalidTreeError({ code: "files_required", message: "prototype name is required" });
	}

	// The record and its first version land together, so no reader ever observes
	// a prototype with no source and every read path can skip a nil check.
	return sql.begin(async (tx) => {
		const [created] = await tx<PrototypeRow[]>`
			INSERT INTO prototypes ${tx({ name, summary: input.summary?.trim() ?? "", author: input.author })}
			RETURNING *
		`;
		const version = await appendVersion(
			tx,
			created.id,
			input.files,
			input.entryPoint ?? "",
			input.label?.trim() ?? "",
			input.author,
		);
		const [activated] = await tx<PrototypeRow[]>`
			UPDATE prototypes SET active_version_id = ${version.id}, updated_at = now()
			WHERE id = ${created.id}
			RETURNING *
		`;
		return getPrototype(activated);
	}) as Promise<Prototype>;
};

export const publishVersion = async (
	sql: Sql,
	prototypeId: string,
	input: PublishInput,
): Promise<Version> =>
	sql.begin(async (tx) => {
		await lockPrototype(tx, prototypeId);
		const version = await appendVersion(
			tx,
			prototypeId,
			input.files,
			input.entryPoint ?? "",
			input.label?.trim() ?? "",
			input.author,
		);
		await tx`
			UPDATE prototypes SET active_version_id = ${version.id}, updated_at = now()
			WHERE id = ${prototypeId}
		`;
		return version;
	}) as Promise<Version>;

/**
 * Copies a version's tree into a brand-new prototype.
 *
 * The copy is a copy, not a reference. A remix has to keep working when the
 * thing it was remixed from is archived, rewritten, or deleted — which is also
 * why the lineage columns are plain uuids rather than foreign keys.
 */
export const forkPrototype = async (
	sql: Sql,
	prototypeId: string,
	input: ForkInput,
): Promise<Prototype> =>
	sql.begin(async (tx) => {
		const source = await lockPrototype(tx, prototypeId);

		const versionId = input.versionId?.trim() || source.active_version_id;
		if (!versionId) {
			throw new VersionNotFoundError("(prototype has no active version)");
		}
		// Scoped by prototype_id as well as id: a valid version id belonging to a
		// DIFFERENT prototype is not a way to graft one tree onto another.
		const [sourceVersion] = await tx<VersionRow[]>`
			SELECT * FROM prototype_versions
			WHERE id = ${versionId} AND prototype_id = ${prototypeId}
		`;
		if (!sourceVersion) {
			throw new VersionNotFoundError(versionId);
		}

		const [created] = await tx<PrototypeRow[]>`
			INSERT INTO prototypes ${tx({
				name: input.name?.trim() || `${source.name} (copy)`,
				summary: source.summary,
				author: input.author,
				forked_from_prototype_id: source.id,
				forked_from_version_id: sourceVersion.id,
			})}
			RETURNING *
		`;

		// Re-validated on the way in, so every version row in the table has been
		// through the same check whoever produced it.
		const version = await appendVersion(
			tx,
			created.id,
			sourceVersion.files ?? [],
			sourceVersion.entry_point,
			`Forked from ${source.name}`,
			input.author,
		);
		const [activated] = await tx<PrototypeRow[]>`
			UPDATE prototypes SET active_version_id = ${version.id}, updated_at = now()
			WHERE id = ${created.id}
			RETURNING *
		`;
		return getPrototype(activated);
	}) as Promise<Prototype>;

export const listPrototypes = async (sql: Sql, includeArchived = false): Promise<Prototype[]> => {
	const rows = await sql<PrototypeRow[]>`
		SELECT * FROM prototypes
		WHERE ${includeArchived ? sql`true` : sql`NOT is_archived`}
		ORDER BY updated_at DESC
	`;
	return rows.map(getPrototype);
};

export const findPrototype = async (sql: Sql, id: string): Promise<Prototype> => {
	const [row] = await sql<PrototypeRow[]>`SELECT * FROM prototypes WHERE id = ${id}`;
	if (!row) {
		throw new PrototypeNotFoundError(id);
	}
	return getPrototype(row);
};

export const listVersions = async (sql: Sql, prototypeId: string): Promise<VersionSummary[]> => {
	const rows = await sql<VersionRow[]>`
		SELECT ${sql.unsafe(VERSION_SUMMARY_COLUMNS)} FROM prototype_versions
		WHERE prototype_id = ${prototypeId}
		ORDER BY version_number DESC
	`;
	return rows.map(getVersionSummary);
};

export const findVersion = async (
	sql: Sql,
	prototypeId: string,
	versionId: string,
): Promise<Version> => {
	const [row] = await sql<VersionRow[]>`
		SELECT * FROM prototype_versions
		WHERE id = ${versionId} AND prototype_id = ${prototypeId}
	`;
	if (!row) {
		throw new VersionNotFoundError(versionId);
	}
	return getVersion(row);
};

export const updatePrototype = async (
	sql: Sql,
	id: string,
	changes: { name?: string; summary?: string; isArchived?: boolean },
): Promise<Prototype> => {
	const patch: Record<string, unknown> = { updated_at: sql`now()` };
	if (changes.name !== undefined) {
		const name = changes.name.trim();
		if (name === "") {
			throw new InvalidTreeError({ code: "files_required", message: "prototype name is required" });
		}
		patch.name = name;
	}
	if (changes.summary !== undefined) {
		patch.summary = changes.summary.trim();
	}
	if (changes.isArchived !== undefined) {
		patch.is_archived = changes.isArchived;
	}

	const [row] = await sql<PrototypeRow[]>`
		UPDATE prototypes SET ${sql(patch)} WHERE id = ${id} RETURNING *
	`;
	if (!row) {
		throw new PrototypeNotFoundError(id);
	}
	return getPrototype(row);
};

/** Versions go with the prototype via ON DELETE CASCADE. Forks do not: each
 * holds its own copy of the source and only remembers the id. */
export const deletePrototype = async (sql: Sql, id: string): Promise<void> => {
	const rows = await sql`DELETE FROM prototypes WHERE id = ${id} RETURNING id`;
	if (rows.length === 0) {
		throw new PrototypeNotFoundError(id);
	}
};
