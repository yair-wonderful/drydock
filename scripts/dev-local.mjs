#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = new Set(process.argv.slice(2));
const verifyAgentLoop = args.has("--verify-agent-loop");
const noAdapter = args.has("--no-adapter") || process.env.DRYDOCK_DEV_NO_ADAPTER === "1";
const adapterHost = process.env.DRYDOCK_LLM_ADAPTER_HOST?.trim() || "127.0.0.1";
const adapterPort = process.env.DRYDOCK_LLM_ADAPTER_PORT?.trim() || "5399";
const adapterBaseUrl = `http://${adapterHost}:${adapterPort}/v1`;
const children = [];
let shuttingDown = false;

function writePrefixed(prefix, stream, chunk) {
	const text = chunk.toString();
	for (const line of text.split(/\r?\n/)) {
		if (line.length === 0) continue;
		stream.write(`[${prefix}] ${line}\n`);
	}
}

function stopChild(child) {
	if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
	try {
		if (process.platform === "win32") child.kill("SIGTERM");
		else process.kill(-child.pid, "SIGTERM");
	} catch {
		try {
			child.kill("SIGTERM");
		} catch {
			// Already gone.
		}
	}
}

function shutdown(exitCode = 0) {
	if (shuttingDown) return;
	shuttingDown = true;
	for (const child of children) stopChild(child);
	setTimeout(() => process.exit(exitCode), 750).unref();
}

function startService(name, command, commandArgs, options = {}) {
	const child = spawn(command, commandArgs, {
		cwd: repoRoot,
		detached: process.platform !== "win32",
		env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1", ...options.env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	children.push(child);
	child.stdout.on("data", (chunk) => writePrefixed(name, process.stdout, chunk));
	child.stderr.on("data", (chunk) => writePrefixed(name, process.stderr, chunk));
	child.on("exit", (code, signal) => {
		if (shuttingDown) return;
		const reason = signal ? `signal ${signal}` : `exit ${code ?? 0}`;
		console.error(`[drydock] ${name} stopped early (${reason}). Stopping the rest.`);
		shutdown(code && code > 0 ? code : 1);
	});
	return child;
}

function sleep(ms) {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForHttp(label, url, timeoutMs = 120_000) {
	const deadline = Date.now() + timeoutMs;
	let lastError = "not ready yet";
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
			if (response.status < 500) return;
			lastError = `${response.status} ${response.statusText}`;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await sleep(750);
	}
	throw new Error(`${label} did not become ready at ${url}: ${lastError}`);
}

function runOnce(name, command, commandArgs) {
	return new Promise((resolveRun) => {
		const child = spawn(command, commandArgs, {
			cwd: repoRoot,
			env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
			stdio: "inherit",
		});
		child.on("exit", (code, signal) => {
			if (signal) {
				console.error(`[drydock] ${name} stopped with ${signal}.`);
				resolveRun(1);
				return;
			}
			resolveRun(code ?? 0);
		});
	});
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

if (!existsSync(resolve(repoRoot, "apps/server/.env"))) {
	console.warn(
		"[drydock] No apps/server/.env file found. Copy apps/server/.env.example and set DATABASE_URL before the API can start.",
	);
}

console.log("[drydock] Starting local Drydock in one terminal. Press Ctrl+C to stop everything.");
const apiEnv = noAdapter
	? {}
	: {
			// The OpenAI-compatible SDK requires a key even when the local adapter
			// is the real backend. Supplying these defaults here keeps `pnpm run dev`
			// useful after copying `.env.example` unchanged. Existing shell env wins.
			OPENAI_API_KEY: process.env.OPENAI_API_KEY?.trim() || "drydock-local-function-adapter",
			OPENAI_BASE_URL: process.env.OPENAI_BASE_URL?.trim() || adapterBaseUrl,
		};

if (!noAdapter) {
	startService("adapter", "node", ["scripts/wonderful-llm-adapter.mjs"]);
}
startService("api", pnpm, ["--filter", "@drydock/server", "run", "dev"], { env: apiEnv });
startService("web", pnpm, ["--filter", "@drydock/web", "run", "dev"]);

try {
	await Promise.all([
		noAdapter ? Promise.resolve() : waitForHttp("model adapter", `${adapterBaseUrl}/models`),
		waitForHttp("API", "http://127.0.0.1:5299/healthz"),
		waitForHttp("web app", "http://127.0.0.1:5199/"),
	]);
	console.log("[drydock] Ready: web http://127.0.0.1:5199 · API http://127.0.0.1:5299");

	if (verifyAgentLoop) {
		const code = await runOnce("agent loop verification", pnpm, [
			"--filter",
			"@drydock/web",
			"run",
			"verify:agent-loop",
		]);
		shutdown(code);
	}
} catch (error) {
	console.error(`[drydock] Startup failed: ${error instanceof Error ? error.message : String(error)}`);
	shutdown(1);
}
