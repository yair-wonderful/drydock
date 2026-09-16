import { createServer } from "node:http";
import { registerAgentRoutes } from "./agent/routes.ts";
import { getSql } from "./db/connect.ts";
import { migrate } from "./db/migrate.ts";
import { applyCorsHeaders } from "./http/cors.ts";
import { withRoute } from "./http/respond.ts";
import { Router } from "./http/router.ts";
import { registerPrototypeRoutes } from "./prototypes/routes.ts";

const PORT = Number(process.env.PORT ?? 5299);

const main = async (): Promise<void> => {
	const sql = getSql();

	// Migrating on boot, not in a separate deploy step: this is a single
	// internal-tool process with one Postgres, not a fleet where a startup race
	// between replicas would matter. `migrate` is idempotent, so a restart is
	// always safe to re-run it against.
	const ran = await migrate(sql);
	if (ran.length > 0) {
		console.log(`Applied migrations: ${ran.join(", ")}`);
	}

	const router = new Router();
	registerPrototypeRoutes(router, sql);
	registerAgentRoutes(router);
	// Every route runs through `withRoute`, `/healthz` included — a bare route
	// handler's return value is not itself a response; `Router.handle` ignores
	// it, so without this wrapper the request never gets a reply and hangs.
	router.get(
		"/healthz",
		withRoute(async () => ({ ok: true })),
	);

	const server = createServer((req, res) => {
		applyCorsHeaders(req, res);
		// The browser sends this ahead of any cross-origin POST/PUT/DELETE to ask
		// permission; it carries no route of its own; the headers above are the
		// entire answer.
		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}
		void router.handle(req, res);
	});

	server.listen(PORT, () => {
		console.log(`Drydock server listening on http://127.0.0.1:${PORT}`);
	});

	// A signal handler flushes the pool cleanly rather than letting Postgres
	// notice the socket died a few seconds later.
	const shutdown = async (): Promise<void> => {
		server.close();
		await sql.end();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
