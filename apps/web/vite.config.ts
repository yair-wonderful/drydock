import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);

/**
 * The design system is a real workspace dependency here, not a path into a
 * monorepo checkout. It keeps its own `exports` map, so `@wonderful/ui`,
 * `@wonderful/ui/components`, `@wonderful/theme/theme.css` and the rest resolve
 * natively and need no aliases — which is the whole reason it is vendored as a
 * package rather than as a folder of copied files.
 *
 * `vendor/ui` is produced by `pnpm run sync:design-system`. If this throws, that
 * is the step that has not been run.
 */
const getDesignSystemRoot = (): string => {
	try {
		return dirname(require.resolve("@wonderful/ui/package.json"));
	} catch {
		throw new Error(
			"@wonderful/ui is not installed. Run `pnpm run sync:design-system` at the repo root, then `pnpm install`.",
		);
	}
};

const UI_ROOT = getDesignSystemRoot();

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: [
			// The design system resolves its OWN internals through `@/`. This alias
			// exists for that and nothing else — Drydock's own code uses relative
			// imports deliberately, so this stays unambiguous.
			{ find: /^@\/(.*)$/, replacement: resolve(UI_ROOT, "src/$1") },
		],
		// One React instance across the host, the design system and the compiled
		// prototype — two Reacts is broken hooks.
		dedupe: ["react", "react-dom"],
	},
	optimizeDeps: {
		// esbuild-wasm ships its own worker + wasm; prebundling mangles it.
		exclude: ["esbuild-wasm"],
	},
	server: { port: 5199, host: "127.0.0.1" },
});
