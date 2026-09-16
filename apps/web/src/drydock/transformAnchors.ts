import * as Babel from "@babel/standalone";
import type { PrototypeTree, WfSourceMap } from "./types";

/**
 * Browser port of `common/apptemplate/template/infra/source-anchor-plugin.ts`.
 *
 * The in-repo plugin is already a STANDALONE `enforce: "pre"` transform: it
 * parses TSX and emits TSX, running no JSX/TS lowering of its own (that stays
 * with the bundler downstream). That decoupling is why it moves here at all —
 * Babel runs first, esbuild lowers afterwards, exactly as Vite does it.
 *
 * Only three things had to change, and all three are Node built-ins with direct
 * browser equivalents:
 *   - `crypto.randomBytes`  → `crypto.getRandomValues`
 *   - `crypto.createHash`   → a small synchronous hash (WebCrypto's digest is
 *                             async, and a Babel visitor cannot await)
 *   - `path` + `process.cwd()` → nothing: a virtual tree's paths are already
 *                                relative to their own root.
 *
 * Everything else — the visitor, the opaque id, the loop/iterable flags, the
 * zero-DOM-footprint spread — is the original logic.
 */

const ANCHORS_GLOBAL = "__WF_ANCHORS__";

// biome-ignore lint/suspicious/noExplicitAny: Babel nodes are untyped here.
type Any = any;

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
	if (name?.type !== "JSXIdentifier") {
		return null;
	}
	return name.name === "Fragment" ? null : name.name;
}

function getEnclosingComponentName(jsxPath: Any): string {
	const fn = jsxPath.getFunctionParent();
	if (!fn) {
		return "";
	}
	if (fn.node.id?.name) {
		return fn.node.id.name;
	}
	const parent = fn.parentPath?.node;
	if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
		return parent.id.name;
	}
	if (parent?.type === "AssignmentExpression" && parent.left?.type === "Identifier") {
		return parent.left.name;
	}
	return "";
}

function getMapIterable(jsxPath: Any): string | null {
	const fn = jsxPath.getFunctionParent();
	const call = fn?.parentPath;
	if (!call?.isCallExpression?.()) {
		return null;
	}
	const callee = call.node.callee;
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

function createAnchorPlugin(salt: string, map: WfSourceMap) {
	return ({ types: t }: Any): Any => ({
		name: "wonderful-source-anchor",
		visitor: {
			JSXOpeningElement(path: Any, state: Any) {
				const name = getAnchorableName(path.node.name);
				if (!name) {
					return;
				}
				const loc = path.node.loc;
				if (!loc) {
					return;
				}
				const file: string = state.filename ?? "unknown";
				const { line, column } = loc.start;
				const id = getOpaqueId(`${salt}:${file}:${line}:${column}`);

				const iterable = getMapIterable(path);
				map[id] = {
					name,
					component: getEnclosingComponentName(path) || undefined,
					loop: iterable === null ? undefined : true,
					iterable: iterable || undefined,
					file,
					line,
				};

				// `<El {...(globalThis.__WF_ANCHORS__?.["<id>"])} />`
				// In production the global is never set, so the spread is
				// `{...undefined}` — a no-op that leaves the DOM completely clean.
				path.node.attributes.push(
					t.jsxSpreadAttribute(
						t.optionalMemberExpression(
							t.memberExpression(t.identifier("globalThis"), t.identifier(ANCHORS_GLOBAL)),
							t.stringLiteral(id),
							true,
							true,
						),
					),
				);
			},
		},
	});
}

export interface AnchorResult {
	tree: PrototypeTree;
	sourceMap: WfSourceMap;
}

/** Runs the anchor pass over every `.tsx`/`.jsx` file, leaving the rest alone. */
export default function transformAnchors(tree: PrototypeTree): AnchorResult {
	const salt = ID_NAMESPACE;
	const sourceMap: WfSourceMap = {};
	const plugin = createAnchorPlugin(salt, sourceMap);
	const out: PrototypeTree = {};

	for (const [file, source] of Object.entries(tree)) {
		if (!/\.[jt]sx$/.test(file)) {
			out[file] = source;
			continue;
		}
		const result = Babel.transform(source, {
			filename: file,
			babelrc: false,
			configFile: false,
			// Parse TS + JSX but run NO transform preset, so the output keeps its
			// JSX/TS syntax for esbuild to lower afterwards.
			parserOpts: { plugins: ["jsx", "typescript"] },
			plugins: [plugin],
		});
		out[file] = result.code ?? source;
	}

	return { tree: out, sourceMap };
}
