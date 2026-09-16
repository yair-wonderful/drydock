import type { PrototypeFile } from "@drydock/prototype";
import type { PrototypeTree } from "../drydock";

/**
 * The harness's entry point convention. The compiler (`compileTree.ts`) hard-
 * codes this same value; a persisted prototype has to round-trip through it
 * unchanged, or a save-then-reload would compile a different module than the
 * one the author was editing.
 *
 * This does NOT need to agree with `@drydock/prototype`'s own default
 * (`App.tsx`, no `src/` prefix) — that default only ever applies when a caller
 * omits `entryPoint`, and this app never does. The two packages independently
 * choosing different defaults is fine; two callers disagreeing about which one
 * is truthful for the SAME persisted tree would not be.
 */
export const HARNESS_ENTRY_POINT = "src/index.tsx";

/**
 * `PrototypeTree` → `PrototypeFile[]`, the shape the server persists.
 *
 * Order is preserved: per the language spec, a plain object's string keys (not
 * shaped like array indices) enumerate in insertion order, and no path here is
 * ever an integer-like string. That is what makes this conversion lossless
 * rather than merely usually-fine.
 */
export const getFilesFromTree = (tree: PrototypeTree): PrototypeFile[] =>
	Object.entries(tree).map(([path, contents]) => ({ path, contents }));

/** The inverse conversion, for hydrating the editor from a fetched version. */
export const getTreeFromFiles = (files: readonly PrototypeFile[]): PrototypeTree =>
	Object.fromEntries(files.map((file) => [file.path, file.contents]));
