// The package's `browser` field points at a non-ESM build, so the ESM browser
// entry is named explicitly — otherwise `esbuild.initialize` is not a function.
import type { Loader, Message, Plugin } from "esbuild-wasm/esm/browser.js";
import * as esbuild from "esbuild-wasm/esm/browser.js";
import wasmUrl from "esbuild-wasm/esbuild.wasm?url";
import checkUtilityClasses from "./checkUtilityClasses";
import { isExternal } from "./externals";
import transformAnchors from "./transformAnchors";
import type { CompileMessage, CompileResult, PrototypeTree } from "./types";

const NAMESPACE = "drydock";
const ENTRY = "src/index.tsx";
const EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", ".json", "/index.tsx", "/index.ts"];

let initPromise: Promise<void> | null = null;

/** esbuild-wasm may only be initialized once per page. */
function getEsbuild(): Promise<void> {
	initPromise ??= esbuild.initialize({ wasmURL: wasmUrl });
	return initPromise;
}

function getLoader(file: string): Loader {
	if (file.endsWith(".json")) return "json";
	if (file.endsWith(".css")) return "css";
	if (/\.[jt]sx$/.test(file)) return "tsx";
	return "ts";
}

/** POSIX-only path join, enough for a flat virtual tree. */
function resolveRelative(importer: string, specifier: string): string {
	const base = importer.split("/").slice(0, -1);
	const parts = specifier.split("/");
	for (const part of parts) {
		if (part === "." || part === "") continue;
		if (part === "..") base.pop();
		else base.push(part);
	}
	return base.join("/");
}

function toCompileMessage(message: Message): CompileMessage {
	return {
		text: message.text,
		file: message.location?.file,
		line: message.location?.line,
		column: message.location?.column,
	};
}

/** Every class name in a `className="..."` literal — used to measure how much
 *  of a prototype's styling the host's prebuilt Tailwind sheet can cover. */
function getClassNames(tree: PrototypeTree): string[] {
	const found = new Set<string>();
	for (const source of Object.values(tree)) {
		for (const match of source.matchAll(/className\s*=\s*"([^"]*)"/g)) {
			for (const name of match[1].split(/\s+/)) {
				if (name) found.add(name);
			}
		}
	}
	return [...found].sort();
}

function createVirtualFsPlugin(tree: PrototypeTree): Plugin {
	return {
		name: "drydock-virtual-fs",
		setup(build) {
			build.onResolve({ filter: /.*/ }, (args) => {
				if (args.kind === "entry-point") {
					return { path: args.path, namespace: NAMESPACE };
				}
				if (isExternal(args.path)) {
					// Left to the host's import map at runtime — never bundled.
					return { path: args.path, external: true };
				}
				if (!args.path.startsWith(".")) {
					// A bare specifier that is not an agreed external. Failing here,
					// loudly, is the point: a prototype may not invent dependencies.
					return {
						errors: [
							{
								text: `"${args.path}" is not available to prototypes. Use the design system (@wonderful/ui-base) or a relative file.`,
							},
						],
					};
				}
				const base = resolveRelative(args.importer, args.path);
				for (const extension of EXTENSIONS) {
					if (tree[base + extension] !== undefined) {
						return { path: base + extension, namespace: NAMESPACE };
					}
				}
				return { errors: [{ text: `File not found in prototype: ${args.path}` }] };
			});

			build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => {
				const contents = tree[args.path];
				if (contents === undefined) {
					return { errors: [{ text: `File not found in prototype: ${args.path}` }] };
				}
				return { contents, loader: getLoader(args.path) };
			});
		},
	};
}

/**
 * The Drydock contract, in one function: a multi-file React + TypeScript tree
 * in, a single ES module plus a report out. Nothing here touches a server, a
 * container or a filesystem.
 */
export default async function compileTree(tree: PrototypeTree): Promise<CompileResult> {
	const started = performance.now();
	await getEsbuild();

	const classNames = getClassNames(tree);

	let anchored: PrototypeTree;
	let sourceMap: CompileResult["sourceMap"];
	try {
		const result = transformAnchors(tree);
		anchored = result.tree;
		sourceMap = result.sourceMap;
	} catch (error) {
		return {
			code: null,
			sourceMap: {},
			errors: [{ text: `Anchor pass failed: ${(error as Error).message}` }],
			warnings: [],
			classNames,
			durationMs: performance.now() - started,
		};
	}

	// Utility rejection runs BEFORE esbuild. A prototype whose classes cannot be
	// styled is not a prototype worth mounting — and failing here means the
	// author sees the real reason rather than a page that merely looks wrong.
	//
	// Checked against the ORIGINAL tree, never `anchored`: the anchor pass
	// regenerates the source through Babel, which shifts every line, so an
	// error raised against it would point at code the author cannot see. A
	// wrong line number in a prototyping tool is worse than no error at all.
	const utilities = checkUtilityClasses(tree);
	if (utilities.errors.length > 0) {
		return {
			code: null,
			sourceMap,
			errors: utilities.errors,
			warnings: utilities.warnings,
			classNames,
			durationMs: performance.now() - started,
		};
	}

	try {
		const result = await esbuild.build({
			entryPoints: [ENTRY],
			bundle: true,
			write: false,
			format: "esm",
			target: "es2022",
			jsx: "automatic",
			platform: "browser",
			plugins: [createVirtualFsPlugin(anchored)],
			logLevel: "silent",
		});
		return {
			code: result.outputFiles?.[0]?.text ?? null,
			sourceMap,
			errors: result.errors.map(toCompileMessage),
			warnings: [...utilities.warnings, ...result.warnings.map(toCompileMessage)],
			classNames,
			durationMs: performance.now() - started,
		};
	} catch (error) {
		const failure = error as { errors?: Message[]; warnings?: Message[]; message?: string };
		return {
			code: null,
			sourceMap,
			errors: failure.errors?.length
				? failure.errors.map(toCompileMessage)
				: [{ text: failure.message ?? String(error) }],
			warnings: [...utilities.warnings, ...(failure.warnings?.map(toCompileMessage) ?? [])],
			classNames,
			durationMs: performance.now() - started,
		};
	}
}
