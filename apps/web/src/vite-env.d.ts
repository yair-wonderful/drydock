/// <reference types="vite/client" />

/**
 * There used to be an ambient `declare module "@wonderful/ui/components"`
 * here, to keep `tsc` from following that specifier into the design system's
 * real source and typechecking its internals under this app's compiler
 * options. It moved to `tsconfig.json`'s `paths` (pointing at
 * `src/types/wonderfulUiComponentsStub.ts`) instead, because an ambient
 * declaration stops being consulted the moment a REAL, resolvable package
 * exists for that specifier — which happened when `@wonderful/ui` became a
 * real vendored workspace dependency rather than a Vite-only alias. `paths`
 * redirects type resolution unconditionally, so it does not have that
 * precedence problem.
 */
