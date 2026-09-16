import * as AppSdkStub from "../fixtures/appSdkStub";
import { EXTERNALS } from "./externals";

/**
 * The host side of the externals contract.
 *
 * This is a faithful miniature of `wonderful-ui/src/lib/app-shared-deps.ts`:
 * the host holds the live module namespaces on a global, publishes an import
 * map whose bare specifiers point at small re-export shims, and the compiled
 * prototype imports those bare specifiers. The only difference is where the
 * shims live — the real host SERVES them at `/__shared/*.js`, and we mint them
 * as blob URLs, because a spike has no server.
 *
 * Two properties of the real host make this work and are worth stating, since
 * the whole no-VM architecture rests on them:
 *
 *  1. `loadAppBundle()` imports a URL STRING. A `blob:` URL is as good as an
 *     `/app-assets/` one — same dynamic import, same module semantics.
 *  2. The host's import map is deliberately GLOBAL, not scoped to
 *     `/app-assets/` (see the comment at `app-shared-deps.ts:196`). A module
 *     loaded from a `blob:` URL therefore resolves its bare specifiers through
 *     it exactly like a served bundle does.
 */

const SHARED_GLOBAL_KEY = "__DRYDOCK_SHARED__";
const IMPORT_MAP_ATTRIBUTE = "data-drydock-importmap";

type Namespaces = Record<string, Record<string, unknown>>;

declare global {
	// eslint-disable-next-line no-var
	var __DRYDOCK_SHARED__: Namespaces | undefined;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Source for one re-export shim. Named exports are enumerated off the live
 * namespace, so the shim always matches whatever the host actually has — the
 * same trick the served `/__shared/react.js` re-exports rely on.
 */
function getShimSource(specifier: string, namespace: Record<string, unknown>): string {
	const names = Object.keys(namespace).filter(
		(name) => name !== "default" && IDENTIFIER.test(name),
	);
	return [
		`const ns = globalThis[${JSON.stringify(SHARED_GLOBAL_KEY)}][${JSON.stringify(specifier)}];`,
		"export default ns.default ?? ns;",
		...names.map((name) => `export const ${name} = ns[${JSON.stringify(name)}];`),
	].join("\n");
}

function createShimUrl(specifier: string, namespace: Record<string, unknown>): string {
	const blob = new Blob([getShimSource(specifier, namespace)], {
		type: "text/javascript",
	});
	return URL.createObjectURL(blob);
}

let initialized = false;

/**
 * Publishes the host's namespaces and the import map. Idempotent, and must run
 * before the first prototype import — an import map has to be in the document
 * before the module loads that depends on it.
 */
export default async function getSharedRuntime(): Promise<void> {
	if (initialized) {
		return;
	}
	initialized = true;

	const [react, reactDom, jsxRuntime, uiBase] = await Promise.all([
		import("react"),
		import("react-dom"),
		import("react/jsx-runtime"),
		// The prototype says `@wonderful/ui-base`; in-monorepo that IS
		// `@wonderful/ui` — the same library, consumed from source.
		//
		// This MUST stay a string literal. It is what lets Vite's dev server and
		// its production bundler statically resolve and correctly serve/bundle
		// the real module — turning it into a non-literal (a string variable) to
		// dodge TypeScript's own resolution breaks the app at runtime, not just
		// in a type sense: the mount silently times out because the browser gets
		// a bare, unmapped specifier with nothing to resolve it against. Verified
		// by testing both forms against the live dev server, not inferred: with
		// the literal, `scripts/verify.ts` passes 9/9; with a non-literal, the
		// design-system mount check times out.
		//
		// TypeScript's own opinion about this specifier is handled separately, in
		// tsconfig.json's `paths` — see the comment there for why.
		import("@wonderful/ui/components"),
	]);

	const namespaces: Namespaces = {
		react: react as unknown as Record<string, unknown>,
		"react-dom": reactDom as unknown as Record<string, unknown>,
		"react/jsx-runtime": jsxRuntime as unknown as Record<string, unknown>,
		"@wonderful/ui-base": uiBase as unknown as Record<string, unknown>,
		"@wonderful/app-sdk": AppSdkStub as unknown as Record<string, unknown>,
		// `@wonderful/genui-react` is a real external in the app template, but
		// nothing in this spike renders agent-emitted UI, so it is left out of
		// the map — `getSharedRuntime` simply skips a specifier with no
		// namespace, which is the behaviour a partial host should have anyway.
	};

	globalThis[SHARED_GLOBAL_KEY] = namespaces;

	const imports: Record<string, string> = {};
	for (const specifier of EXTERNALS) {
		const namespace = namespaces[specifier];
		if (namespace) {
			imports[specifier] = createShimUrl(specifier, namespace);
		}
	}

	if (document.head.querySelector(`script[${IMPORT_MAP_ATTRIBUTE}]`)) {
		return;
	}
	const script = document.createElement("script");
	script.type = "importmap";
	script.setAttribute(IMPORT_MAP_ATTRIBUTE, "true");
	script.textContent = JSON.stringify({ imports });
	document.head.appendChild(script);
}

/** The export count per specifier — what the spike reports as evidence the
 *  prototype is seeing the host's REAL design system, not a stub. */
export function getSharedExportCounts(): Record<string, number> {
	const namespaces = globalThis[SHARED_GLOBAL_KEY] ?? {};
	return Object.fromEntries(
		Object.entries(namespaces).map(([key, ns]) => [key, Object.keys(ns).length]),
	);
}
