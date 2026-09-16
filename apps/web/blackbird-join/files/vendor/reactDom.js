// Re-export of the canvas's ReactDOM, addressable as a URL.
//
// A frame is its own realm, so it cannot borrow the canvas's live module
// instances the way a shadow-root mount can — it has to IMPORT them. These
// modules give each bare specifier in a package's import map something
// fetchable to point at. In dev the canvas's own dev server serves them (its
// preview service worker deliberately passes `/src/` through); a deployed
// canvas points the same import map at its built chunks instead.
//
// Every name is re-exported EXPLICITLY off the namespace. `export * from
// "react-dom"` does not work here: Vite pre-bundles from CJS and the resulting
// module exports only `default` — named imports in ordinary app code are a
// Vite TRANSFORM, not real exports, and a transform cannot reach across the
// frame boundary. A star re-export yields a module with no named bindings,
// and the prototype dies at eval with "does not provide an export named ...".

import * as ns from "react-dom";

const mod = ns.default ?? ns;

export default mod;
export const createPortal = mod.createPortal;
export const flushSync = mod.flushSync;
export const preconnect = mod.preconnect;
export const prefetchDNS = mod.prefetchDNS;
export const preinit = mod.preinit;
export const preinitModule = mod.preinitModule;
export const preload = mod.preload;
export const preloadModule = mod.preloadModule;
export const requestFormReset = mod.requestFormReset;
export const unstable_batchedUpdates = mod.unstable_batchedUpdates;
export const useFormState = mod.useFormState;
export const useFormStatus = mod.useFormStatus;
export const version = mod.version;
