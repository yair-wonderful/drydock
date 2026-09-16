import { createServer } from "node:http";
import { getSql } from "./db/connect.ts";
import { migrate } from "./db/migrate.ts";
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
	router.get("/healthz", async () => ({ ok: true }));

	const server = createServer((req, res) => {
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
