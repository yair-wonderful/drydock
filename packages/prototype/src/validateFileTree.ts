import { DEFAULT_ENTRY_POINT, MAX_FILES, MAX_PATH_BYTES, MAX_VERSION_BYTES } from "./limits.ts";
import type {
	PrototypeFile,
	PrototypeFileTree,
	PrototypeValidationError,
	Result,
	ValidatedTree,
} from "./types.ts";

const fail = (
	code: PrototypeValidationError["code"],
	message: string,
	path?: string,
): { ok: false; error: PrototypeValidationError } => ({ ok: false, error: { code, message, path } });

/**
 * Byte length, not character length.
 *
 * `TextEncoder` rather than `Buffer` because this package is held by the browser
 * as well as the server, and the two must not disagree about whether a path
 * fits. `"…".length` is 1 but three bytes, so the cheap version of this check
 * would accept paths the storage column rejects.
 */
const getByteLength = (value: string): number => new TextEncoder().encode(value).length;

/**
 * JavaScript's answer to Go's `utf8.ValidString`.
 *
 * A JS string is UTF-16 and can hold an unpaired surrogate, which has no valid
 * UTF-8 encoding. Left alone it becomes U+FFFD somewhere downstream — silently
 * renaming the file, which is exactly the class of quiet mangling this whole
 * function exists to prevent.
 */
const hasLoneSurrogate = (value: string): boolean =>
	/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);

/**
 * Decides whether one path may be stored.
 *
 * The path is not just a label. It becomes a key in the virtual filesystem the
 * browser compiles and serves the prototype from, and it is what a module
 * specifier resolves against — so a path that escapes its tree is a traversal in
 * a service worker's URL space.
 *
 * Every rule below therefore REFUSES rather than rewrites. Silently normalising
 * a path would break the `import` that names it, which is a worse and much
 * later failure than a clear rejection at the point of writing.
 */
export const validateFilePath = (path: string): Result<string> => {
	if (path === "") {
		return fail("invalid_file_path", "path is empty");
	}
	if (getByteLength(path) > MAX_PATH_BYTES) {
		return fail("invalid_file_path", `path is longer than ${MAX_PATH_BYTES} bytes`, path);
	}
	if (hasLoneSurrogate(path)) {
		return fail("invalid_file_path", "path is not valid UTF-8", path);
	}
	if (path !== path.trim()) {
		return fail("invalid_file_path", "path has leading or trailing whitespace", path);
	}
	if (path.startsWith("/")) {
		return fail("invalid_file_path", "path must be relative", path);
	}
	// Rejected outright rather than translated: a Windows-style separator that
	// reaches a POSIX virtual filesystem becomes part of the filename, so
	// "src\App.tsx" would sit silently beside "src/App.tsx".
	if (path.includes("\\")) {
		return fail("invalid_file_path", "path must use forward slashes", path);
	}
	// A drive letter or a scheme would make the path absolute on some host.
	if (path.includes(":")) {
		return fail("invalid_file_path", "path must not contain a colon", path);
	}
	for (const character of path) {
		const code = character.codePointAt(0) ?? 0;
		if (code < 0x20 || code === 0x7f) {
			return fail("invalid_file_path", "path contains a control character", path);
		}
	}
	for (const segment of path.split("/")) {
		if (segment === "") {
			// Catches "a//b" and a trailing slash, which names a directory rather
			// than a file.
			return fail("invalid_file_path", "path has an empty segment", path);
		}
		if (segment === ".") {
			return fail("invalid_file_path", "path has a '.' segment", path);
		}
		if (segment === "..") {
			return fail("invalid_file_path", "path escapes the prototype", path);
		}
	}
	return { ok: true, value: path };
};

/** Summed contents length. Paths and JSON framing are excluded, because that is
 * the unit MAX_VERSION_BYTES is expressed in — the check and the limit have to
 * measure the same thing or they disagree at the boundary. */
export const getTotalBytes = (files: PrototypeFileTree): number =>
	files.reduce((total, file) => total + getByteLength(file.contents), 0);

/**
 * Checks a whole submitted tree and returns the stored shape.
 *
 * Returning the validated tree (rather than just a verdict) is deliberate: it
 * means no caller can persist a payload it forgot to check, because the only
 * way to get the storable value is to have gone through here.
 *
 * `entryPoint` is resolved here too. It defaults when empty and must name a file
 * that is actually present — a version whose entry point does not exist is one
 * that can never be rendered, and that is worth catching at write time rather
 * than as a blank stage later.
 */
export const validateFileTree = (
	files: readonly PrototypeFile[],
	entryPoint = "",
): Result<ValidatedTree> => {
	if (files.length === 0) {
		return fail("files_required", "a prototype must contain at least one file");
	}
	if (files.length > MAX_FILES) {
		return fail("too_many_files", `a prototype may contain at most ${MAX_FILES} files`);
	}

	// Collisions are checked case-insensitively as well as exactly. Two files
	// differing only in case cannot both survive a round trip through a
	// case-insensitive filesystem or cache, and within one prototype the pair is
	// always a mistake rather than an intention.
	const seen = new Map<string, string>();
	const validated: PrototypeFile[] = [];

	for (const file of files) {
		const path = validateFilePath(file.path);
		if (!path.ok) {
			return path;
		}
		const key = file.path.toLowerCase();
		const previous = seen.get(key);
		if (previous !== undefined) {
			return fail(
				"duplicate_file_path",
				`${previous} and ${file.path} collide`,
				file.path,
			);
		}
		seen.set(key, file.path);
		validated.push({ path: file.path, contents: file.contents });
	}

	const totalBytes = getTotalBytes(validated);
	if (totalBytes > MAX_VERSION_BYTES) {
		return fail(
			"source_too_large",
			`prototype source is ${totalBytes} bytes, over the ${MAX_VERSION_BYTES} byte limit`,
		);
	}

	const resolvedEntryPoint = entryPoint.trim() === "" ? DEFAULT_ENTRY_POINT : entryPoint.trim();
	const entryPointPath = validateFilePath(resolvedEntryPoint);
	if (!entryPointPath.ok) {
		return entryPointPath;
	}
	if (!seen.has(resolvedEntryPoint.toLowerCase())) {
		return fail(
			"entry_point_missing",
			`entry point ${resolvedEntryPoint} is not in the tree`,
			resolvedEntryPoint,
		);
	}

	return { ok: true, value: { files: validated, entryPoint: resolvedEntryPoint, totalBytes } };
};
