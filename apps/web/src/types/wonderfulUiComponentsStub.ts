/**
 * A type-only stand-in for `@wonderful/ui/components`, consulted ONLY by
 * TypeScript — see the `paths` entry in `tsconfig.json` that redirects here.
 *
 * `@wonderful/ui` is vendored as a real, resolvable workspace package (see
 * `scripts/fetchDesignSystem.ts`), which is exactly what Vite's dev server and
 * bundler need to correctly serve and build the literal
 * `import("@wonderful/ui/components")` in `getSharedRuntime.ts` — that
 * resolution must stay real and untouched.
 *
 * But the same realness means `tsc`, left alone, resolves that same specifier
 * to `vendor/ui/src/components/index.ts` and fully typechecks the entire
 * component library's internals under THIS app's compiler options —
 * `erasableSyntaxOnly`, no design-system devDependencies — which the design
 * system was never authored to satisfy and which is not this app's job to
 * enforce. `tsconfig.json`'s `paths` maps the specifier to this file for type
 * resolution only; Vite does not read tsconfig `paths` (no
 * `vite-tsconfig-paths` plugin is installed), so its own resolution of the
 * same specifier is entirely unaffected.
 *
 * Deliberately empty. The one call site double-casts the awaited value
 * (`uiBase as unknown as Record<string, unknown>`), which is valid for any
 * source type by construction — so this module's exports are never actually
 * read for their shape, only for existing as a module `tsc` can resolve
 * without leaving this file's `erasableSyntaxOnly` compiler options.
 */
export {};
