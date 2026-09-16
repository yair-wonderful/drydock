import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The web app and this server are different origins even in local dev — Vite
 * on 5199, this server on 5299 — so a browser `fetch` (unlike curl, or the
 * test suite's direct `postgres`/`http` calls) is subject to CORS and gets
 * blocked without these headers, preflight included.
 *
 * More than one origin, not one: the standalone harness (5199) and a
 * Blackbird checkout joined via `blackbird-join` (5181 by convention) are
 * both real clients of the same server, often running at the same time
 * against the same database. `DRYDOCK_WEB_ORIGIN` takes a comma-separated
 * list; the response reflects back whichever of them made the request
 * (the standard multi-origin CORS pattern — `Access-Control-Allow-Origin`
 * cannot itself hold a list), with `Vary: Origin` so a cache never serves
 * one origin's allow-header to another.
 */
const ALLOWED_ORIGINS = (process.env.DRYDOCK_WEB_ORIGIN ?? "http://127.0.0.1:5199,http://127.0.0.1:5181")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

export const applyCorsHeaders = (req: IncomingMessage, res: ServerResponse): void => {
	const origin = req.headers.origin;
	if (origin && ALLOWED_ORIGINS.includes(origin)) {
		res.setHeader("Access-Control-Allow-Origin", origin);
		res.setHeader("Vary", "Origin");
	}
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};
