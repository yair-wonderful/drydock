/**
 * Fetches the Wonderful design system into `vendor/`.
 *
 * This script is the ONLY link between Drydock and the Wonderful monorepo, and
 * it is strictly one-directional: it reads `libs/ui` and `libs/theme` and writes
 * nothing back. Drydock is otherwise a standalone project — it does not live in
 * the monorepo, does not build against a monorepo checkout, and does not need
 * one present to run.
 *
 * The design system is consumed FROM SOURCE rather than from the published
 * `@wonderful/ui-base` package, for the same reason the Phase 0 spike did: the
 * published package is a build artifact of the next major, while prototypes are
 * supposed to look like the platform as it is today. Source also means a
 * designer can pull a component change the hour it merges.
 *
 * What lands is two real pnpm workspace packages, not a pile of copied files:
 *
 *   vendor/theme/  @wonderful/theme  (design tokens, CSS only)
 *   vendor/ui/     @wonderful/ui     (components, hooks, utils)
 *
 * so `@wonderful/theme: "workspace:*"` inside the UI package keeps resolving
 * exactly as it does in the monorepo. The alternative — rewriting that edge to a
 * file: path or a version — breaks the moment the design system adds another
 * internal package.
 *
 * devDependencies are dropped on the way in. Drydock consumes the design system;
 * it does not build, test, lint or Storybook it. Keeping them would drag
 * Storybook, Biome, Figma Code Connect, vitest and two TypeScript majors into an
 * install that never runs any of them.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_URL = "https://github.com/wonderfulcx/wonderful.git";

/** The subset of the monorepo Drydock reads. Nothing else is fetched. */
const SOURCE_PATHS = ["libs/ui", "libs/theme"] as const;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR_DIR = join(ROOT, "vendor");

type PackageJson = {
	name: string;
	version: string;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
	[key: string]: unknown;
};

const run = (command: string, args: string[], cwd?: string): string =>
	execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/**
 * Produces a checkout containing only SOURCE_PATHS.
 *
 * `--filter=blob:none --sparse --depth=1` keeps this to seconds and tens of MB
 * against a monorepo that is neither. A local path may be supplied instead
 * (`--from ../wonderful`) when a checkout already exists, which is the common
 * case on a developer machine and skips the network entirely.
 */
const getSourceCheckout = (localSource: string | null): { dir: string; commit: string; cleanup: () => void } => {
	if (localSource) {
		const dir = resolve(localSource);
		if (!existsSync(join(dir, "libs", "ui"))) {
			throw new Error(`${dir} does not look like a wonderful checkout (no libs/ui)`);
		}
		// A dirty local checkout is reported as such rather than silently pinned
		// to a commit that does not describe what was copied.
		const status = run("git", ["status", "--porcelain", "--", ...SOURCE_PATHS], dir);
		const commit = run("git", ["rev-parse", "HEAD"], dir);
		return { dir, commit: status ? `${commit}-dirty` : commit, cleanup: () => {} };
	}

	const dir = mkdtempSync(join(tmpdir(), "drydock-ds-"));
	run("git", ["clone", "--filter=blob:none", "--sparse", "--depth=1", REPO_URL, dir]);
	run("git", ["sparse-checkout", "set", ...SOURCE_PATHS], dir);
	const commit = run("git", ["rev-parse", "HEAD"], dir);
	return { dir, commit, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

/**
 * devDependencies that have to survive the strip because something RETAINED
 * depends on them at consume time, not at build time.
 *
 * `tailwindcss` is the whole list today: the design system's stylesheet does
 * `@plugin "tailwindcss-animate"`, and that plugin declares tailwindcss as a
 * peer. In the monorepo tailwind is a devDependency of libs/ui and the peer is
 * satisfied by hoisting; strip it here and pnpm reports an unmet peer against
 * `vendor/ui` on every install.
 *
 * Kept as an explicit allowlist rather than a heuristic: the correct set is
 * "devDeps that are peers of retained deps", which is cheap to state and
 * expensive to infer, and a wrong guess either drags Storybook back in or
 * reintroduces the warning.
 */
const RETAINED_DEV_DEPENDENCIES = ["tailwindcss"] as const;

/**
 * Adds `"./package.json"` to an `exports` map, leaving everything else alone.
 * A package without an `exports` field exposes every file already, so there is
 * nothing to add in that case.
 */
const getExportsWithPackageJson = (exports: unknown): unknown => {
	if (!exports || typeof exports !== "object" || Array.isArray(exports)) {
		return exports;
	}
	return { ...(exports as Record<string, unknown>), "./package.json": "./package.json" };
};

const getRetainedDevDependencies = (
	devDependencies: Record<string, string> | undefined,
): Record<string, string> | undefined => {
	if (!devDependencies) {
		return undefined;
	}
	const retained = Object.fromEntries(
		RETAINED_DEV_DEPENDENCIES.filter((name) => devDependencies[name]).map((name) => [
			name,
			devDependencies[name],
		]),
	);
	return Object.keys(retained).length > 0 ? retained : undefined;
};

/**
 * Rewrites a fetched package.json into something installable outside the
 * monorepo: devDependencies stripped to the allowlist above, no scripts that
 * reference tooling we did not fetch, and a marker saying where it came from so
 * nobody edits it by hand.
 */
const getVendoredPackageJson = (source: PackageJson, commit: string): PackageJson => {
	const vendored: PackageJson = {
		...source,
		private: true,
		// `exports` is an allowlist: a subpath it does not name is unreachable,
		// package.json included. In the monorepo nothing needed to read it, but
		// out here both the Vite config and the Blackbird patcher locate the
		// design system with `require.resolve("@wonderful/ui/package.json")`, which
		// fails with ERR_PACKAGE_PATH_NOT_EXPORTED unless it is declared. Adding it
		// is conventional and exposes nothing that `npm view` would not.
		exports: getExportsWithPackageJson(source.exports),
		scripts: undefined,
		devDependencies: getRetainedDevDependencies(source.devDependencies),
		drydockVendored: {
			source: `${REPO_URL}#${commit}`,
			note: "Generated by scripts/fetchDesignSystem.ts. Do not edit by hand — changes belong in the wonderful monorepo and arrive here via a re-fetch.",
		},
	};
	// `undefined` keys still serialize as absent, but deleting keeps the emitted
	// file free of the noise a reviewer would otherwise have to ignore.
	delete vendored.scripts;
	if (!vendored.devDependencies) {
		delete vendored.devDependencies;
	}
	return vendored;
};

const vendorPackage = (sourceDir: string, sourcePath: string, targetName: string, commit: string): string => {
	const from = join(sourceDir, sourcePath);
	const to = join(VENDOR_DIR, targetName);

	rmSync(to, { recursive: true, force: true });
	mkdirSync(to, { recursive: true });

	// Only what the package actually needs at consume time. Storybook stories,
	// tests, Figma Code Connect files and build scripts stay behind.
	cpSync(join(from, "src"), join(to, "src"), {
		recursive: true,
		filter: (entry) =>
			!/\.(stories|test|spec)\.[jt]sx?$/.test(entry) &&
			!/\.figma\.[jt]sx?$/.test(entry) &&
			!entry.includes(`${"/"}__tests__${"/"}`),
	});

	const sourcePackage = JSON.parse(readFileSync(join(from, "package.json"), "utf8")) as PackageJson;
	writeFileSync(
		join(to, "package.json"),
		`${JSON.stringify(getVendoredPackageJson(sourcePackage, commit), null, "\t")}\n`,
	);

	return sourcePackage.name;
};

const main = (): void => {
	const args = process.argv.slice(2);
	const fromIndex = args.indexOf("--from");
	const localSource = fromIndex === -1 ? null : args[fromIndex + 1];

	if (fromIndex !== -1 && !localSource) {
		throw new Error("--from requires a path to a wonderful checkout");
	}

	console.log(
		localSource
			? `Fetching design system from local checkout: ${resolve(localSource)}`
			: `Fetching design system from ${REPO_URL} (sparse, shallow)`,
	);

	const { dir, commit, cleanup } = getSourceCheckout(localSource);
	try {
		mkdirSync(VENDOR_DIR, { recursive: true });
		const theme = vendorPackage(dir, "libs/theme", "theme", commit);
		const ui = vendorPackage(dir, "libs/ui", "ui", commit);

		writeFileSync(
			join(VENDOR_DIR, "SOURCE.json"),
			`${JSON.stringify({ repository: REPO_URL, commit, paths: SOURCE_PATHS, packages: [theme, ui], fetchedAt: new Date().toISOString() }, null, "\t")}\n`,
		);

		console.log(`  ${theme} -> vendor/theme`);
		console.log(`  ${ui} -> vendor/ui`);
		console.log(`  pinned at ${commit}`);
		console.log("Run `pnpm install` to link them into the workspace.");
	} finally {
		cleanup();
	}
};

main();
