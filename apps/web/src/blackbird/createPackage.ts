import type { CompileResult, WfSourceMap } from "../drydock";
import type { PackageFile, PackageOptions } from "./types";

/**
 * Turns a Drydock compile into a Blackbird **prototype package**.
 *
 * Blackbird's contract (`spec/MANIFEST.md`) is "a built static app +
 * `canvas-manifest.json`". Drydock's premise is "no build". Those only look
 * incompatible: the contract never says *who* built the app or *when*, so a
 * tree compiled in the browser a moment ago satisfies it exactly as well as
 * one built by CI. This function is the whole adapter — Blackbird needs no
 * change to ingest the result, which is the point of having a versioned
 * contract in the first place.
 *
 * The one thing that genuinely changes across the boundary: inside the spike,
 * the compiled module resolves `react` / `@wonderful/ui-base` through the
 * HOST's import map and shares the host's single React instance. A frame is a
 * separate realm, so that trick does not survive — the package declares its
 * OWN import map, and the canvas serves the shared modules. Each frame gets
 * its own React instance, which for a canvas is correct rather than
 * regrettable: per-frame state isolation is what makes many live frames safe.
 */

const MIME: Record<string, string> = {
	html: "text/html",
	js: "text/javascript",
	css: "text/css",
	json: "application/json",
};

function getMime(path: string): string {
	return MIME[path.split(".").pop() ?? ""] ?? "application/octet-stream";
}

function asFile(path: string, contents: string): PackageFile {
	return { path, contents, mime: getMime(path) };
}

/**
 * Reports the current screen to the canvas, per the live protocol in
 * `spec/MANIFEST.md`. Kept tiny and dependency-free: it is the only part of
 * the package that knows Blackbird exists at all.
 *
 * The route is derived from the SCREEN (`sid`), never from `location`.
 *
 * That is not a shortcut, it is the fix for a real bug. The canvas scopes
 * comments by exact route equality, and a Drydock package lives at
 * `/preview/<uuid>/index.html` with a fresh uuid per compile — so reporting
 * `location.pathname` means every recompile reports a route no existing
 * comment matches, and every comment on the screen silently disappears. Not
 * re-aimed: gone. A comment belongs to a screen, not to the build that
 * happened to be serving it, so the screen is what gets reported.
 */
function getCanvasSnippet(sid: string): string {
	return `(function () {
	if (window.parent === window) return;
	var send = function () {
		window.parent.postMessage({ type: 'PROTOTYPE_STATE', sid: ${JSON.stringify(sid)} }, '*');
		window.parent.postMessage({
			// Stable across rebuilds — the screen, plus any in-app hash route.
			route: '/' + ${JSON.stringify(sid)} + location.hash,
			type: 'PROTOTYPE_ROUTE',
		}, '*');
	};
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', send);
	} else {
		send();
	}
	window.addEventListener('hashchange', send);
	window.addEventListener('popstate', send);
})();
`;
}

/** Vite's standard react-refresh preamble. Dev-only — see `reactRefreshPreamble`. */
function getRefreshPreamble(): string {
	return `		<script type="module">
			import RefreshRuntime from "/@react-refresh";
			RefreshRuntime.injectIntoGlobalHook(window);
			window.$RefreshReg$ = () => {};
			window.$RefreshSig$ = () => (type) => type;
			window.__vite_plugin_react_preamble_installed__ = true;
		</script>
`;
}

/**
 * Publishes the source-anchor map into the frame.
 *
 * The compiled module carries `{...(globalThis.__WF_ANCHORS__?.["<id>"])}` on
 * every JSX element. In production that global is never set, so the spread is
 * `{...undefined}` and the DOM stays completely clean — which is exactly what
 * happened here until this existed, leaving every element in the frame with no
 * identity but its text.
 *
 * Emitted as a CLASSIC script so it runs before the module: module scripts are
 * deferred, classic ones are not, and the map has to be in place before the
 * first element renders.
 */
function getAnchorsScript(sourceMap: WfSourceMap): string {
	const anchors: Record<string, Record<string, string>> = {};
	for (const [id, entry] of Object.entries(sourceMap)) {
		anchors[id] = {
			"data-source-id": id,
			"data-source-file": entry.file,
			"data-source-line": String(entry.line),
			...(entry.name ? { "data-source-name": entry.name } : {}),
			...(entry.component ? { "data-source-component": entry.component } : {}),
		};
	}
	return `globalThis.__WF_ANCHORS__ = ${JSON.stringify(anchors)};
`;
}

/**
 * The frame's half of comment anchoring.
 *
 * Capture and re-resolution have to run INSIDE the prototype, because that is
 * where the DOM is — the canvas cannot reach across a frame boundary to read
 * it. So the canvas asks over postMessage and the frame answers, which is
 * exactly the shape Blackbird's live protocol already has for state, inspect
 * and drift. Two request/reply pairs, additive: a package without this script
 * simply never answers, and the canvas falls back to positional pins.
 */
function getAnchorBridge(): string {
	return `import { captureAnchor, resolveAnchor } from "@drydock/anchoring";

if (window.parent !== window) {
	const reply = (message) => window.parent.postMessage(message, "*");

	/** The deepest element at a point given in fractions of the viewport. */
	const elementAt = (x, y) =>
		document.elementFromPoint(
			Math.min(window.innerWidth - 1, Math.max(0, x * window.innerWidth)),
			Math.min(window.innerHeight - 1, Math.max(0, y * window.innerHeight)),
		);

	window.addEventListener("message", (event) => {
		const data = event.data;
		if (!data || typeof data !== "object") return;

		if (data.type === "CANVAS_CAPTURE_ANCHOR") {
			const element = elementAt(data.x, data.y);
			reply({
				type: "PROTOTYPE_ANCHOR",
				requestId: data.requestId,
				signals: element ? captureAnchor(element, { x: data.x, y: data.y }) : null,
			});
			return;
		}

		if (data.type === "CANVAS_RESOLVE_ANCHORS") {
			reply({
				type: "PROTOTYPE_ANCHORS_RESOLVED",
				requestId: data.requestId,
				results: (data.anchors || []).map((anchor) => {
					const resolution = resolveAnchor(anchor.signals, document);
					const rect = resolution.element && resolution.element.getBoundingClientRect();
					return {
						id: anchor.id,
						status: resolution.status,
						reason: resolution.reason,
						matched: resolution.matched,
						changed: resolution.changed,
						// Where the element is NOW, so the canvas can move the pin to
						// it — the one case where moving a pin is honest, because the
						// element was identified first.
						position: rect
							? {
									x: (rect.left + rect.width / 2) / window.innerWidth,
									y: (rect.top + rect.height / 2) / window.innerHeight,
								}
							: null,
					};
				}),
			});
		}
	});

	reply({ type: "PROTOTYPE_ANCHORING_READY" });
}
`;
}

function getIndexHtml(title: string, vendorBaseUrl: string, refresh: boolean): string {
	const imports = {
		react: `${vendorBaseUrl}/react.js`,
		"react-dom": `${vendorBaseUrl}/reactDom.js`,
		"react-dom/client": `${vendorBaseUrl}/reactDomClient.js`,
		"react/jsx-runtime": `${vendorBaseUrl}/jsxRuntime.js`,
		"@wonderful/ui-base": `${vendorBaseUrl}/uiBase.js`,
		"@drydock/anchoring": `${vendorBaseUrl}/anchoring.js`,
	};

	return `<!doctype html>
<html lang="en" data-theme-mode="light">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>${title}</title>
${refresh ? getRefreshPreamble() : ""}		<script type="importmap">
${JSON.stringify({ imports }, null, 2)}
		</script>
		<link rel="stylesheet" href="styles.css" />
		<style>
			html, body { margin: 0; padding: 0; background: var(--background); color: var(--foreground); }
		</style>
	</head>
	<body>
		<div id="root"></div>
		<script src="anchors.js"></script>
		<script src="canvas-snippet.js"></script>
		<script type="module" src="anchor-bridge.js"></script>
		<script type="module">
			import { createElement } from "react";
			import { createRoot } from "react-dom/client";
			import Prototype from "./app.js";
			createRoot(document.getElementById("root")).render(createElement(Prototype));
		</script>
	</body>
</html>
`;
}

export default function createPackage(
	result: CompileResult,
	css: string,
	options: PackageOptions,
): PackageFile[] {
	if (!result.code) {
		throw new Error("Cannot package a prototype that did not compile.");
	}
	const { title, vendorBaseUrl = "/src/vendor", reactRefreshPreamble = false } = options;
	const screens = options.screens ?? [{ sid: "main", title }];

	const manifest = {
		manifestVersion: 1,
		prototype: { entry: "index.html", emitsRoute: true },
		screens,
		// Not part of the contract Blackbird reads — carried so a package can be
		// traced back to the compile that produced it.
		drydock: {
			compiledInBrowser: true,
			durationMs: Math.round(result.durationMs),
			anchors: Object.keys(result.sourceMap).length,
		},
	};

	return [
		asFile("index.html", getIndexHtml(title, vendorBaseUrl, reactRefreshPreamble)),
		asFile("anchors.js", getAnchorsScript(result.sourceMap)),
		asFile("anchor-bridge.js", getAnchorBridge()),
		asFile("app.js", result.code),
		asFile("styles.css", css),
		asFile("canvas-snippet.js", getCanvasSnippet(screens[0].sid)),
		asFile("canvas-manifest.json", JSON.stringify(manifest, null, 2)),
	];
}
