/// <reference types="vite/client" />

/**
 * The design system is resolved by a Vite alias to `libs/ui/src` (see
 * `vite.config.ts`), not by TypeScript. Declaring it as an opaque module keeps
 * this project's typecheck scoped to this project: pointing `paths` at
 * `libs/ui/src` instead would typecheck the entire component library here, and
 * with two copies of `@types/react` on disk (this project's and the
 * workspace's) that produces hundreds of spurious "two different types with
 * this name exist" errors.
 *
 * The spike only ever consumes this module as a namespace to build the
 * import-map shim from, so its export shape is genuinely not interesting here.
 */
declare module "@wonderful/ui/components" {
	const namespace: Record<string, unknown>;
	export = namespace;
}
