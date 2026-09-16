/**
 * Applies every migration in `migrations/` that has not run yet, in filename
 * order, each in its own transaction.
 *
 * This is ~40 lines because standalone it can be. The controller needed Atlas
 * to diff generated DDL out of GORM models against a 935-file history; here the
 * schema is hand-written SQL that nobody generates, so the entire job is "run
 * the files you have not run". No CLI, no dev database to diff against, and
 * nothing that needs an egress exception to install — which is precisely the
 * blocker that stalled the controller version of this feature.
 *
 * Deliberately not supported: down-migrations. A prototype library is not worth
 * the machinery, and a reversible migration that has never been reversed is a
 * claim nobody has tested.
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Sql } from "postgres";
import { getSql } from "./connect.ts";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");

const ensureMigrationsTable = async (sql: Sql): Promise<void> => {
	await sql`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name       text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)
	`;
};

export const migrate = async (sql: Sql = getSql()): Promise<string[]> => {
	await ensureMigrationsTable(sql);

	const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
	const applied = new Set(
		(await sql<{ name: string }[]>`SELECT name FROM schema_migrations`).map((row) => row.name),
	);

	const ran: string[] = [];
	for (const name of files) {
		if (applied.has(name)) {
			continue;
		}
		const statements = await readFile(join(MIGRATIONS_DIR, name), "utf8");
		// One transaction per file: a migration either lands whole or not at all,
		// and a failure leaves the ones before it applied and recorded.
		await sql.begin(async (tx) => {
			await tx.unsafe(statements);
			await tx`INSERT INTO schema_migrations ${tx({ name })}`;
		});
		ran.push(name);
	}
	return ran;
};

// Running this file directly migrates and exits; importing it does not.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const sql = getSql();
	const ran = await migrate(sql);
	console.log(ran.length === 0 ? "No migrations to apply." : `Applied: ${ran.join(", ")}`);
	await sql.end();
}
