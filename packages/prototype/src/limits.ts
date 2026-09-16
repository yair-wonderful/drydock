/**
 * What a prototype may contain.
 *
 * These are deliberately generous against what anyone writes by hand and tight
 * against what a runaway agent could emit. They are not tuning knobs: every one
 * of them is a boundary that a test asserts exactly, so moving one should mean
 * deciding to, not drifting into it.
 */

/**
 * Total source bytes across every file in one version.
 *
 * The tree is stored inline as JSONB rather than in object storage, which is
 * what lets the whole feature skip presigned uploads, a bundle key and a
 * static-serving path. 2 MiB is the ceiling that keeps that trade-off honest:
 * roughly two orders of magnitude more than a hand-written prototype, and past
 * it the right move is to put the tree in object storage — nothing else in the
 * design has to change.
 */
export const MAX_VERSION_BYTES = 2 * 1024 * 1024;

/**
 * File count, bounded independently of the byte total.
 *
 * The two are not redundant. A thousand one-byte files cost far more to compile
 * and to render than their combined size suggests, because the cost is per
 * module, not per byte.
 */
export const MAX_FILES = 200;

/**
 * One path's length, in BYTES rather than characters — the same unit the
 * storage column is bounded in, so the check and the column agree for a path
 * that is not pure ASCII.
 */
export const MAX_PATH_BYTES = 255;

/** The module the compiler starts from when a version does not name one. */
export const DEFAULT_ENTRY_POINT = "App.tsx";
