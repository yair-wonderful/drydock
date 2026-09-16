import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteHandler } from "./respond.ts";

type Method = "GET" | "POST" | "PUT" | "DELETE";

type Route = {
	method: Method;
	/** Path segments; a segment starting with ":" captures into `params`. */
	segments: string[];
	handler: RouteHandler;
};

/**
 * A router small enough to read in one sitting, which is the point: this
 * project has nine endpoints total. Reaching for Express or Fastify here would
 * mean auditing a dependency's request-parsing and routing behavior for a
 * feature set this file covers in under sixty lines.
 */
export class Router {
	private readonly routes: Route[] = [];

	private add(method: Method, path: string, handler: RouteHandler): void {
		this.routes.push({ method, segments: path.split("/").filter(Boolean), handler });
	}

	get(path: string, handler: RouteHandler): void {
		this.add("GET", path, handler);
	}
	post(path: string, handler: RouteHandler): void {
		this.add("POST", path, handler);
	}
	put(path: string, handler: RouteHandler): void {
		this.add("PUT", path, handler);
	}
	delete(path: string, handler: RouteHandler): void {
		this.add("DELETE", path, handler);
	}

	private match(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
		const requestSegments = pathname.split("/").filter(Boolean);
		for (const route of this.routes) {
			if (route.method !== method || route.segments.length !== requestSegments.length) {
				continue;
			}
			const params: Record<string, string> = {};
			let matched = true;
			for (const [index, segment] of route.segments.entries()) {
				const actual = requestSegments[index];
				if (segment.startsWith(":")) {
					params[segment.slice(1)] = decodeURIComponent(actual);
				} else if (segment !== actual) {
					matched = false;
					break;
				}
			}
			if (matched) {
				return { handler: route.handler, params };
			}
		}
		return null;
	}

	async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
		const found = this.match(req.method ?? "GET", pathname);
		if (!found) {
			res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
			res.end(JSON.stringify({ error: { code: "not_found", message: "no such route" } }));
			return;
		}
		await found.handler(req, res, found.params);
	}
}
