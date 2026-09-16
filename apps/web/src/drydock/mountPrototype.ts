import type { ComponentType } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import getPrototypeStyles from "./prototypeStyleSheet";
import getSharedRuntime from "./getSharedRuntime";
import type { WfSourceMap } from "./types";

/**
 * Mounting, the way the real host does it.
 *
 * `wonderful-ui/src/lib/app-shadow-theme.ts` spells out the contract: the
 * design system's CSS only REFERENCES tokens (`var(--…)`), the host owns the
 * token VALUES on `<html>`, and custom properties inherit across the shadow
 * boundary — so dark mode reaches inside every app with no rebuild. We adopt
 * the component CSS into the shadow root (the host does the same thing with a
 * constructed stylesheet in `legacyAppStyles.ts`) and mirror the mode onto the
 * shadow HOST element, as `mirrorPlatformThemeToHost` does.
 */

let sheet: CSSStyleSheet | null | undefined;

function getUiStyleSheet(): CSSStyleSheet | null {
	if (sheet !== undefined) {
		return sheet;
	}
	try {
		const constructed = new CSSStyleSheet();
		// `:root` matches nothing inside a shadow tree; the host's own sandbox
		// does exactly this rewrite (see `app-style-sandbox.ts`).
		constructed.replaceSync(getPrototypeStyles().replace(/(^|[,\s{}]):root(?=[\s,{:.[>+~])/g, "$1:host"));
		sheet = constructed;
	} catch {
		sheet = null;
	}
	return sheet;
}

export interface MountedPrototype {
	unmount: () => void;
	shadowRoot: ShadowRoot;
	runtimeError: Error | null;
}

export interface MountOptions {
	container: HTMLElement;
	code: string;
	sourceMap: WfSourceMap;
	mode: "light" | "dark";
	onRuntimeError: (error: Error) => void;
}

/**
 * Publishes the anchor map BEFORE the module evaluates, so each element's
 * `data-source-*` lands on its React fiber props — the same ordering the
 * in-repo editor relies on (`useSourceAnchorStamping`).
 */
function publishAnchors(sourceMap: WfSourceMap): void {
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
	(globalThis as Record<string, unknown>).__WF_ANCHORS__ = anchors;
}

export default async function mountPrototype(
	options: MountOptions,
): Promise<MountedPrototype> {
	const { container, code, sourceMap, mode, onRuntimeError } = options;

	await getSharedRuntime();
	publishAnchors(sourceMap);

	const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
	let module: { default?: ComponentType };
	try {
		module = (await import(/* @vite-ignore */ blobUrl)) as { default?: ComponentType };
	} finally {
		URL.revokeObjectURL(blobUrl);
	}

	const Prototype = module.default;
	if (!Prototype) {
		throw new Error("Prototype has no default export.");
	}

	container.replaceChildren();
	const host = document.createElement("div");
	host.style.cssText = "display:block;width:100%;height:100%;";
	// What `mirrorPlatformThemeToHost` writes: the mode carrier plus the legacy
	// class, so token values re-resolve for the whole subtree.
	host.setAttribute("data-theme-mode", mode);
	host.classList.toggle("dark", mode === "dark");
	container.appendChild(host);

	const shadowRoot = host.attachShadow({ mode: "open" });
	const adopted = getUiStyleSheet();
	if (adopted) {
		shadowRoot.adoptedStyleSheets = [adopted];
	}

	const surface = document.createElement("div");
	surface.style.cssText =
		"min-height:100%;background:var(--background);color:var(--foreground);font-family:var(--font-sans, Inter, sans-serif);";
	shadowRoot.appendChild(surface);

	let root: Root | null = createRoot(surface, {
		onUncaughtError: (error) => onRuntimeError(error as Error),
		onCaughtError: (error) => onRuntimeError(error as Error),
	});
	root.render(createElement(Prototype));

	return {
		shadowRoot,
		runtimeError: null,
		unmount: () => {
			root?.unmount();
			root = null;
			host.remove();
		},
	};
}
