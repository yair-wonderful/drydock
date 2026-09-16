import postgres, { type Sql } from "postgres";

/**
 * The connection URL. No default pointing at a real database: a server that
 * silently connects somewhere plausible when misconfigured is how a test suite
 * ends up writing to a database someone cared about.
 */
const getDatabaseUrl = (): string => {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error("DATABASE_URL is not set");
	}
	return url;
};

let shared: Sql | null = null;

/**
 * The process-wide pool. `create*` would promise a new connection each call and
 * quietly exhaust the server; this is a `get*` because it hands back the same
 * one — see `createSql` below for the case that genuinely needs its own.
 */
export const getSql = (): Sql => {
	shared ??= createSql(getDatabaseUrl());
	return shared;
};

/**
 * An independent pool, for a caller that needs its own lifecycle — tests, which
 * create and drop a database per suite and must be able to end their connection
 * without closing the shared one.
 */
export const createSql = (url: string): Sql =>
	postgres(url, {
		// `files` is jsonb and arrives parsed; nothing else needs coercion.
		transform: { undefined: null },
		onnotice: () => {},
	});
