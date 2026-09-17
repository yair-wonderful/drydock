#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const isWonderfulSandbox = existsSync("/workspace/.wonderful");
const sandboxMode = process.argv.includes("--sandbox");
const pinnedSandboxPnpm = "/mnt/cache/pnpm/.tools/pnpm/10.28.1/bin/pnpm";

function getPnpmInvocation(args) {
	if (isWonderfulSandbox && existsSync(pinnedSandboxPnpm)) {
		return { command: "node", args: [pinnedSandboxPnpm, ...args] };
	}
	return { command: pnpm, args };
}

function run(label, command, args, env = {}) {
	console.log(`[drydock] ${label}`);
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		env: { ...process.env, ...env },
		stdio: "inherit",
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

if (isWonderfulSandbox && !sandboxMode && process.env.DRYDOCK_ALLOW_FULL_SANDBOX_INSTALL !== "1") {
	console.error(
		"[drydock] This sandbox is too small for the full design-system install. Use `pnpm run setup:sandbox` here, or set DRYDOCK_ALLOW_FULL_SANDBOX_INSTALL=1 if you intentionally want to try the full laptop setup.",
	);
	process.exit(1);
}

const hasVendoredDesignSystem =
	existsSync(resolve(repoRoot, "vendor/ui/package.json")) &&
	existsSync(resolve(repoRoot, "vendor/theme/package.json"));

if (hasVendoredDesignSystem) {
	console.log("[drydock] Design system vendor is already present.");
} else {
	const sync = getPnpmInvocation(["run", "sync:design-system"]);
	run("Fetching the pinned Wonderful design system.", sync.command, sync.args);
}

const installArgs = [
	"install",
	"--filter",
	sandboxMode ? "@drydock/web" : "@drydock/web...",
	"--filter",
	sandboxMode ? "@drydock/server" : "@drydock/server...",
	"--frozen-lockfile",
	"--network-concurrency=1",
	"--child-concurrency=1",
	...(sandboxMode ? ["--ignore-scripts"] : []),
];
const install = getPnpmInvocation(installArgs);
run(
	sandboxMode
		? "Installing the lightweight sandbox validation dependencies."
		: "Installing the full local workspace with low memory pressure.",
	install.command,
	install.args,
	{
		...((sandboxMode || isWonderfulSandbox) && process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === undefined
			? { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" }
			: {}),
	},
);

console.log(
	sandboxMode
		? "[drydock] Sandbox setup complete. Run `pnpm run typecheck:sandbox` to validate code here."
		: "[drydock] Setup complete. Run `pnpm run dev` to start Drydock.",
);
