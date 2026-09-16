import type { IncomingMessage, ServerResponse } from "node:http";
import { getHttpError, HttpError } from "./errors.ts";

export type RouteHandler = (
	req: IncomingMessage,
	res: ServerResponse,
	params: Record<string, string>,
) => Promise<unknown>;

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
	const payload = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(payload);
};

/**
 * Reads and parses a JSON body, bounded so a caller cannot hand the process an
 * unbounded stream and exhaust memory before validation ever runs.
 *
 * 4 MiB, not 2 MiB: the wire payload is JSON around the 2 MiB source-byte
 * limit, and JSON's escaping can expand content — a source string that is
 * mostly backslashes or control characters roughly doubles on the wire. The
 * store's own byte check is still the real limit; this is only large enough
 * that a valid request never trips it first.
 */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const readJsonBody = (req: IncomingMessage): Promise<unknown> =>
	new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let bytes = 0;
		req.on("data", (chunk: Buffer) => {
			bytes += chunk.length;
			if (bytes > MAX_BODY_BYTES) {
				req.destroy();
				reject(new HttpError(413, "payload_too_large", "request body is too large"));
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			if (bytes === 0) {
				resolve({});
				return;
			}
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				reject(new HttpError(400, "invalid_json", "request body is not valid JSON"));
			}
		});
		req.on("error", reject);
	});

/**
 * Wraps a handler with the one thing every route needs: parse the body (for a
 * method that has one), run the handler, translate whatever it throws through
 * `getHttpError`, and always answer with JSON — including on a crash, so a
 * client never has to guess whether a connection drop was the network or the
 * server.
 */
export const withRoute = (
	handler: (
		req: IncomingMessage,
		params: Record<string, string>,
		body: unknown,
	) => Promise<unknown>,
): RouteHandler => {
	return async (req, res, params) => {
		try {
			const body =
				req.method === "GET" || req.method === "DELETE" ? undefined : await readJsonBody(req);
			const result = await handler(req, params, body);
			sendJson(res, result === undefined ? 204 : 200, result);
		} catch (error) {
			const httpError = getHttpError(error);
			if (httpError.status >= 500) {
				// A 5xx is always ours to look at, so it goes to stderr regardless of
				// how noisy that makes a busy server — a swallowed 500 is a bug nobody
				// gets to find out about.
				console.error(error);
			}
			sendJson(res, httpError.status, {
				error: { code: httpError.code, message: httpError.message, detail: httpError.detail },
			});
		}
	};
};
