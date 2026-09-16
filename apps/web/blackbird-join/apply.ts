/**
 * Applies the Drydock join to a Blackbird checkout.
 *
 *   node blackbird-join/apply.ts <path-to-blackbird>
 *
 * Idempotent. Every edit is additive: it adds vendor modules, a control, and
 * resolve aliases, and makes exactly two insertions in `src/App.jsx`. Nothing
 * in Blackbird's canvas, contract, comments, or service worker is modified —
 * if this needed to change those, the join would be an argument against the
 * architecture rather than for it.
 */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");

/**
 * The design system is resolved as an INSTALLED PACKAGE, not as a path into a
 * monorepo checkout. Drydock vendors it into `vendor/` (see
 * `scripts/fetchDesignSystem.ts`), so the only reliable way to locate it is to
 * ask Node where the package actually is.
 *
 * The previous form — `<repo>/libs/ui/src`, derived by walking two levels up —
 * worked only while this code lived inside the monorepo. Moved out, it still
 * produced a path; it was just a path to nothing, which surfaces as a Vite
 * resolve error in a patched Blackbird rather than as a failure here.
 */
const getPackageSrc = (packageName: string): string => {
	try {
		return path.join(path.dirname(require.resolve(`${packageName}/package.json`)), "src");
	} catch {
		throw new Error(
			`${packageName} is not installed. Run \`pnpm run sync:design-system\` at the repo root, then \`pnpm install\`.`,
		);
	}
};

const MARKER = "drydock-join";

function getAliasBlock(): string {
	const ui = getPackageSrc("@wonderful/ui");
	const theme = getPackageSrc("@wonderful/theme");
	const drydock = path.join(APP, "src/drydock");
	const anchoring = path.join(APP, "src/anchoring");
	const blackbird = path.join(APP, "src/blackbird");
	const fixtures = path.join(APP, "src/fixtures");

	// Array form, most-specific first: Vite's object aliases are prefix matches,
	// so a bare "@wonderful/ui" entry would swallow "@wonderful/ui/styles.css".
	return `    alias: [
      // ${MARKER}: the design system + the Drydock engine, from source.
      { find: "@drydock/anchoring", replacement: ${JSON.stringify(anchoring)} },
      { find: "@drydock/blackbird", replacement: ${JSON.stringify(blackbird)} },
      { find: "@drydock/fixtures", replacement: ${JSON.stringify(fixtures)} },
      { find: "@drydock", replacement: ${JSON.stringify(drydock)} },
      // Regex, not a plain string: Vite's string aliases are prefix matches on
      // the bare id, so "@wonderful/ui/styles.css" never matches the
      // "?inline" form the canvas imports. The capture carries the query through.
      { find: /^@wonderful\\/ui\\/styles\\.css(\\?.*)?$/, replacement: ${JSON.stringify(path.join(ui, "styles/index.css"))} + "$1" },
      { find: "@wonderful/ui/components", replacement: ${JSON.stringify(path.join(ui, "components/index.ts"))} },
      { find: "@wonderful/ui/utils", replacement: ${JSON.stringify(path.join(ui, "utils/index.ts"))} },
      { find: "@wonderful/ui/hooks", replacement: ${JSON.stringify(path.join(ui, "hooks/index.ts"))} },
      { find: "@wonderful/ui/types", replacement: ${JSON.stringify(path.join(ui, "types/index.ts"))} },
      { find: "@wonderful/theme", replacement: ${JSON.stringify(theme)} },
      { find: "@wonderful/ui", replacement: ${JSON.stringify(path.join(ui, "index.ts"))} },
      { find: /^@\\/(.*)$/, replacement: path.resolve(__dirname, "./src") + "/$1" },
    ],
    dedupe: ["react", "react-dom"],`;
}

async function patchViteConfig(root: string): Promise<string> {
	const file = path.join(root, "vite.config.js");
	const source = await readFile(file, "utf8");
	if (source.includes(MARKER)) {
		return "vite.config.js already patched";
	}
	const original = `  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },`;
	if (!source.includes(original)) {
		throw new Error("vite.config.js resolve block not found — Blackbird's config has moved.");
	}
	await writeFile(file, source.replace(original, `  resolve: {\n${getAliasBlock()}\n  },`));
	return "vite.config.js patched";
}

async function patchApp(root: string): Promise<string> {
	const file = path.join(root, "src/App.jsx");
	const source = await readFile(file, "utf8");
	if (source.includes(MARKER)) {
		return "src/App.jsx already patched";
	}

	// Insertion 1 — the import.
	const firstImport = source.indexOf("import ");
	let next =
		`${source.slice(0, firstImport)}import DrydockPanel from './drydock-join/DrydockPanel' // ${MARKER}\n` +
		source.slice(firstImport);

	// Insertion 2 — render it INSIDE the root element. `<PresencePill />` is the
	// first child of App's root div and is unique in the file, which makes it a
	// far safer anchor than "return (": inserting straight after the return
	// produces two root elements and a parse error.
	const anchor = "      <PresencePill />";
	if (!next.includes(anchor)) {
		throw new Error("src/App.jsx anchor <PresencePill /> not found — App's root has moved.");
	}
	next = next.replace(
		anchor,
		`      {/* ${MARKER} */}\n      <DrydockPanel onFrame={placeNewFrame} />\n${anchor}`,
	);

	await writeFile(file, next);
	return "src/App.jsx patched (2 insertions)";
}

/**
 * The comment-store edits.
 *
 * Unlike everything else here these are MODIFICATIONS to Blackbird's own files,
 * because anchoring is not something a canvas can have bolted on from outside:
 * the store is what owns a comment's identity and what decides whether a pin is
 * still pointing at anything. Each edit is a single anchored replacement that
 * throws if its anchor has moved, so a drifted Blackbird fails loudly here
 * rather than silently half-applying.
 */
const COMMENT_EDITS: { file: string; find: string; replace: string }[] = [
	{
		file: "src/comments/storage.js",
		find: `    x: fields.x,\n    y: fields.y,\n    body: fields.body,`,
		replace: `    x: fields.x,\n    y: fields.y,\n    // Element identity captured when the pin was dropped. Optional: a frame\n    // with no anchoring bridge yields none, and the comment stays positional.\n    anchor: fields.anchor || undefined,\n    body: fields.body,`,
	},
	{
		file: "src/comments/CommentsContext.jsx",
		find: `import { startSync, isSyncEnabled, getSessionName } from './sync'`,
		replace: `import { startSync, isSyncEnabled, getSessionName } from './sync'\nimport { captureAnchorInFrame, resolveAnchorsInFrame } from './anchorBridge'`,
	},
];

/**
 * The sync server's whitelist.
 *
 * Every field on the multiplayer wire is whitelisted by design, so `anchor` was
 * silently stripped and the stripped copy broadcast back over each client's
 * optimistic write — anchors vanished for everyone the moment a session was
 * shared. The fix EXTENDS the whitelist rather than bypassing it: the sanitizer
 * caps every string and array, because these signals are persisted in the
 * session file and re-broadcast on every change.
 */
async function patchSyncServer(root: string): Promise<string> {
	const file = path.join(root, "server/sync-server.mjs");
	const source = await readFile(file, "utf8");
	if (source.includes("sanitizeAnchor")) {
		return "server/sync-server.mjs already patched";
	}

	const snippet = await readFile(path.join(HERE, "files/comments/sanitizeAnchor.snippet.mjs"), "utf8");
	const marker = "/**\n * Anchor signals arrive";
	const index = snippet.indexOf(marker);
	if (index < 0) {
		throw new Error("sanitizeAnchor snippet lost its doc comment.");
	}
	const fn = snippet.slice(index).trimEnd();

	const before = "/** Normalize an incoming comment so one malformed write can't poison every";
	if (!source.includes(before)) {
		throw new Error("server/sync-server.mjs: sanitizeComment anchor not found.");
	}
	const field = "    meta: sanitizeMeta(c.meta),\n  }\n}";
	if (!source.includes(field)) {
		throw new Error("server/sync-server.mjs: sanitizeComment's field list has moved.");
	}

	await writeFile(
		file,
		source
			.replace(before, `${fn}\n\n${before}`)
			.replace(
				field,
				"    // Element identity for comment anchoring. Optional: a client that never\n" +
					"    // captured one (or an older build) simply has none.\n" +
					"    anchor: sanitizeAnchor(c.anchor),\n" +
					field,
			),
	);
	return "server/sync-server.mjs patched (anchor added to the wire whitelist)";
}

async function patchComments(root: string): Promise<string[]> {
	const results: string[] = [];
	for (const edit of COMMENT_EDITS) {
		const file = path.join(root, edit.file);
		const source = await readFile(file, "utf8");
		if (source.includes(MARKER) || source.includes(edit.replace.split("\n")[1] ?? "\u0000")) {
			results.push(`${edit.file} already patched`);
			continue;
		}
		if (!source.includes(edit.find)) {
			throw new Error(`${edit.file}: anchor for the comment-store edit not found.`);
		}
		await writeFile(file, source.replace(edit.find, edit.replace));
		results.push(`${edit.file} patched`);
	}
	return results;
}

async function main(): Promise<void> {
	const root = process.argv[2];
	if (!root || !existsSync(path.join(root, "src/App.jsx"))) {
		console.error("usage: node blackbird-join/apply.ts <path-to-blackbird-checkout>");
		process.exitCode = 1;
		return;
	}

	await mkdir(path.join(root, "src/vendor"), { recursive: true });
	await cp(path.join(HERE, "files/vendor"), path.join(root, "src/vendor"), { recursive: true });
	await cp(path.join(HERE, "files/drydock-join"), path.join(root, "src/drydock-join"), {
		recursive: true,
	});
	await cp(
		path.join(HERE, "files/comments/anchorBridge.js"),
		path.join(root, "src/comments/anchorBridge.js"),
	);

	console.log("copied src/vendor + src/drydock-join + src/comments/anchorBridge.js");
	console.log(await patchViteConfig(root));
	console.log(await patchApp(root));
	for (const line of await patchComments(root)) console.log(line);
	console.log(await patchSyncServer(root));
	console.log(
		"\nNOTE: the remaining comment-store edits (the resolution pass in\n" +
			"CommentsContext.jsx and the pin rendering in FramePins.jsx) are larger\n" +
			"than a safe anchored replacement. Apply them from\n" +
			"blackbird-join/files/comments/ — FramePins.reference.jsx is the patched\n" +
			"file in full, and README.md lists the CommentsContext additions.",
	);
	console.log("\nNow: npm run dev — the control is bottom-right.");
}

await main();
