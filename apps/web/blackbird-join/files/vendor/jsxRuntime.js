// `export * from "react/jsx-runtime"` does NOT work here: the runtime is CJS,
// and a star re-export of a CJS-interop module carries no named bindings, so
// the prototype fails at module eval with "does not provide an export named
// 'jsx'". Naming them explicitly off the namespace is interop-proof.
import * as runtime from "react/jsx-runtime";

const mod = runtime.default ?? runtime;

export const Fragment = mod.Fragment;
export const jsx = mod.jsx;
export const jsxs = mod.jsxs;
// Only present in the development runtime; harmless when undefined.
export const jsxDEV = mod.jsxDEV;
