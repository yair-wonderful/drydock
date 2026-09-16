// Re-export of the canvas's React, addressable as a URL.
//
// A frame is its own realm, so it cannot borrow the canvas's live module
// instances the way a shadow-root mount can — it has to IMPORT them. These
// modules give each bare specifier in a package's import map something
// fetchable to point at. In dev the canvas's own dev server serves them (its
// preview service worker deliberately passes `/src/` through); a deployed
// canvas points the same import map at its built chunks instead.
//
// Every name is re-exported EXPLICITLY off the namespace. `export * from
// "react"` does not work here: Vite pre-bundles from CJS and the resulting
// module exports only `default` — named imports in ordinary app code are a
// Vite TRANSFORM, not real exports, and a transform cannot reach across the
// frame boundary. A star re-export yields a module with no named bindings,
// and the prototype dies at eval with "does not provide an export named ...".

import * as ns from "react";

const mod = ns.default ?? ns;

export default mod;
export const Activity = mod.Activity;
export const Children = mod.Children;
export const Component = mod.Component;
export const Fragment = mod.Fragment;
export const Profiler = mod.Profiler;
export const PureComponent = mod.PureComponent;
export const StrictMode = mod.StrictMode;
export const Suspense = mod.Suspense;
export const act = mod.act;
export const cache = mod.cache;
export const cacheSignal = mod.cacheSignal;
export const captureOwnerStack = mod.captureOwnerStack;
export const cloneElement = mod.cloneElement;
export const createContext = mod.createContext;
export const createElement = mod.createElement;
export const createRef = mod.createRef;
export const forwardRef = mod.forwardRef;
export const isValidElement = mod.isValidElement;
export const lazy = mod.lazy;
export const memo = mod.memo;
export const startTransition = mod.startTransition;
export const unstable_useCacheRefresh = mod.unstable_useCacheRefresh;
export const use = mod.use;
export const useActionState = mod.useActionState;
export const useCallback = mod.useCallback;
export const useContext = mod.useContext;
export const useDebugValue = mod.useDebugValue;
export const useDeferredValue = mod.useDeferredValue;
export const useEffect = mod.useEffect;
export const useEffectEvent = mod.useEffectEvent;
export const useId = mod.useId;
export const useImperativeHandle = mod.useImperativeHandle;
export const useInsertionEffect = mod.useInsertionEffect;
export const useLayoutEffect = mod.useLayoutEffect;
export const useMemo = mod.useMemo;
export const useOptimistic = mod.useOptimistic;
export const useReducer = mod.useReducer;
export const useRef = mod.useRef;
export const useState = mod.useState;
export const useSyncExternalStore = mod.useSyncExternalStore;
export const useTransition = mod.useTransition;
export const version = mod.version;
