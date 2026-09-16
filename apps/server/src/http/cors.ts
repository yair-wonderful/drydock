import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The web app and this server are different origins even in local dev — Vite
 * on 5199, this server on 5299 — so a browser `fetch` (unlike curl, or the
 * test suite's direct `postgres`/`http` calls) is subject to CORS and gets
 * blocked without these headers, preflight included. One configurable origin
 * is enough: this is an internal tool with one web client, not a public API.
 */
const ALLOWED_ORIGIN = process.env.DRYDOCK_WEB_ORIGIN ?? "http://127.0.0.1:5199";

export const applyCorsHeaders = (_req: IncomingMessage, res: ServerResponse): void => {
	res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
};
