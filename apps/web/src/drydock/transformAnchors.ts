import { generate } from "@babel/generator";
import { parse } from "@babel/parser";
import * as t from "@babel/types";
import type { PrototypeTree, WfSourceMap } from "./types";

/**
 * Browser port of `common/apptemplate/template/infra/source-anchor-plugin.ts`.
 *
 * The in-repo plugin is already a STANDALONE `enforce: "pre"` transform: it
 * parses TSX and emits TSX, running no JSX/TS lowering of its own (that stays
 * with the bundler downstream). That decoupling is why it moves here at all —
 * the anchor pass runs first, esbuild lowers afterwards, exactly as Vite does it.
 *
 * This file intentionally uses Babel's small parser/generator packages instead
 * of the old all-in-one browser bundle. That bundle contains every Babel preset
 * and plugin, which made low-memory installs fail before the web app was even
 * linked. Drydock only needs TSX parsing, one AST edit, and TSX printing.
 *
 * Only three things had to change from the Node plugin, and all three are Node
 * built-ins with direct browser equivalents:
 *   - `crypto.randomBytes`  → `crypto.getRandomValues`
 *   - `crypto.createHash`   → a small synchronous hash (WebCrypto's digest is
 *                             async, and an AST visitor cannot await)
 *   - `path` + `process.cwd()` → nothing: a virtual tree's paths are already
 *                                relative to their own root.
 *
 * Everything else — the visitor, the opaque id, the loop/iterable flags, the
 * zero-DOM-footprint spread — mirrors the original logic.
 */

const ANCHORS_GLOBAL = "__WF_ANCHORS__";

// biome-ignore lint/suspicious/noExplicitAny: Babel AST nodes are intentionally handled generically here.
type Any = any;

interface VisitContext {
	file: string;
	sourceMap: WfSourceMap;
	/** Name of the nearest function parent, matching Babel path.getFunctionParent(). */
	componentName: string;
	/** Iterable name when the nearest function parent is directly passed to `.map(...)`. */
	mapIterable: string | null;
}

/**
 * A FIXED namespace, where the in-repo Node plugin uses `crypto.randomBytes`
 * per build.
 *
 * That difference is deliberate and load-bearing. The Node plugin randomises to
 * keep ids opaque across deployed builds, which is right when the id only has
 * to survive until the page renders. Here an id has to survive a RECOMPILE:
 * comment anchoring re-resolves against the rewritten page, and a per-compile
 * salt changes every id on every edit, so the strongest identity signal would
 * be worthless at exactly the moment it is needed.
 *
 * With a fixed namespace an id is a pure function of file:line:col — stable
 * while the element stays put, changing only when its source location moves.
 * It stays opaque (the mapping lives in the private sidecar, never the DOM),
 * and it is not a secret: anchoring treats it as evidence, never as authority.
 */
const ID_NAMESPACE = "wonderful-drydock-anchor-v1";

/**
 * FNV-1a, run over two offset bases to reach 10 hex chars. Stands in for the
 * sha1 slice the Node plugin uses: the id only has to be stable within a build
 * and opaque outside it, never cryptographic.
 */
function getOpaqueId(input: string): string {
	let a = 0x811c9dc5;
	let b = 0x01000193;
	for (let i = 0; i < input.length; i += 1) {
		const c = input.charCodeAt(i);
		a = Math.imul(a ^ c, 0x01000193) >>> 0;
		b = Math.imul(b ^ c, 0x811c9dc5) >>> 0;
	}
	return (a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")).slice(0, 10);
}

function getAnchorableName(name: Any): string | null {
	if (!t.isJSXIdentifier(name)) {
		return null;
	}
	return name.name === "Fragment" ? null : name.name;
}

function getFunctionName(node: Any, parent: Any | null): string {
	if (node.id?.type === "Identifier") {
		return node.id.name;
	}
	if (parent?.type === "VariableDeclarator" && parent.init === node && parent.id?.type === "Identifier") {
		return parent.id.name;
	}
	if (parent?.type === "AssignmentExpression" && parent.right === node && parent.left?.type === "Identifier") {
		return parent.left.name;
	}
	return "";
}

function getMapIterableFromFunctionParent(parent: Any | null): string | null {
	if (parent?.type !== "CallExpression") {
		return null;
	}
	const callee = parent.callee;
	if (
		callee?.type !== "MemberExpression" ||
		callee.property?.type !== "Identifier" ||
		callee.property.name !== "map"
	) {
		return null;
	}
	const obj = callee.object;
	if (obj?.type === "Identifier") {
		return obj.name;
	}
	if (obj?.type === "MemberExpression" && obj.property?.type === "Identifier") {
		return obj.property.name;
	}
	return "";
}

function isFunctionLike(node: Any): boolean {
	return (
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression" ||
		node.type === "ObjectMethod" ||
		node.type === "ClassMethod" ||
		node.type === "ClassPrivateMethod"
	);
}

function isNode(value: unknown): value is Any {
	return !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string";
}

const SKIPPED_CHILD_KEYS = new Set([
	"comments",
	"errors",
	"extra",
	"innerComments",
	"leadingComments",
	"loc",
	"range",
	"start",
	"end",
	"tokens",
	"trailingComments",
]);

function visitChildren(node: Any, context: VisitContext): void {
	for (const [key, value] of Object.entries(node)) {
		if (SKIPPED_CHILD_KEYS.has(key)) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const child of value) {
				if (isNode(child)) {
					visitNode(child, node, context);
				}
			}
			continue;
		}
		if (isNode(value)) {
			visitNode(value, node, context);
		}
	}
}

function addAnchorAttribute(path: Any, context: VisitContext): void {
	const name = getAnchorableName(path.name);
	if (!name) {
		return;
	}
	const loc = path.loc;
	if (!loc) {
		return;
	}
	const { line, column } = loc.start;
	const id = getOpaqueId(`${ID_NAMESPACE}:${context.file}:${line}:${column}`);

	context.sourceMap[id] = {
		name,
		component: context.componentName || undefined,
		loop: context.mapIterable === null ? undefined : true,
		iterable: context.mapIterable || undefined,
		file: context.file,
		line,
	};

	// `<El {...(globalThis.__WF_ANCHORS__?.["<id>"])} />`
	// In production the global is never set, so the spread is `{...undefined}` —
	// a no-op that leaves the DOM completely clean.
	path.attributes.push(
		t.jsxSpreadAttribute(
			t.optionalMemberExpression(
				t.memberExpression(t.identifier("globalThis"), t.identifier(ANCHORS_GLOBAL)),
				t.stringLiteral(id),
				true,
				true,
			),
		),
	);
}

function visitNode(node: Any, parent: Any | null, context: VisitContext): void {
	if (isFunctionLike(node)) {
		visitChildren(node, {
			...context,
			componentName: getFunctionName(node, parent),
			mapIterable: getMapIterableFromFunctionParent(parent),
		});
		return;
	}

	if (node.type === "JSXOpeningElement") {
		addAnchorAttribute(node, context);
	}
	visitChildren(node, context);
}

function transformFile(file: string, source: string, sourceMap: WfSourceMap): string {
	const ast = parse(source, {
		sourceFilename: file,
		sourceType: "module",
		plugins: ["jsx", "typescript"],
	});

	visitNode(ast, null, { file, sourceMap, componentName: "", mapIterable: null });
	return generate(ast, { comments: true, retainLines: true }, source).code;
}

export interface AnchorResult {
	tree: PrototypeTree;
	sourceMap: WfSourceMap;
}

/** Runs the anchor pass over every `.tsx`/`.jsx` file, leaving the rest alone. */
export default function transformAnchors(tree: PrototypeTree): AnchorResult {
	const sourceMap: WfSourceMap = {};
	const out: PrototypeTree = {};

	for (const [file, source] of Object.entries(tree)) {
		if (!/\.[jt]sx$/.test(file)) {
			out[file] = source;
			continue;
		}
		out[file] = transformFile(file, source, sourceMap);
	}

	return { tree: out, sourceMap };
}
