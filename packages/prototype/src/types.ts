/** One source file of a prototype. */
export type PrototypeFile = {
	/**
	 * Relative, POSIX-style, no leading slash, no "..". Enforced by
	 * `validateFileTree` before anything is stored — see the note there on why
	 * this is a security boundary rather than a formatting preference.
	 */
	path: string;
	contents: string;
};

/**
 * A version's whole source tree.
 *
 * An ordered array rather than a `path -> contents` map, so authoring order
 * survives a round trip: the tree is shown as a file list, and an object would
 * re-sort it by key on every read. Path uniqueness is enforced by validation,
 * not by the type.
 */
export type PrototypeFileTree = readonly PrototypeFile[];

/**
 * Why a tree was refused. Carried as a code rather than only a message so the
 * server can map it to a status and the editor can point at the offending file
 * without parsing prose.
 */
export type PrototypeValidationCode =
	| "files_required"
	| "too_many_files"
	| "source_too_large"
	| "invalid_file_path"
	| "duplicate_file_path"
	| "entry_point_missing";

export type PrototypeValidationError = {
	code: PrototypeValidationCode;
	message: string;
	/** The offending path, when one file is to blame. */
	path?: string;
};

export type ValidatedTree = {
	files: PrototypeFileTree;
	entryPoint: string;
	totalBytes: number;
};

/**
 * Validation returns a result rather than throwing.
 *
 * Both callers want the failure as data: the editor renders it next to the file
 * that caused it, and the server maps the code to a status. An exception would
 * make the browser's job harder for no gain on the server's.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: PrototypeValidationError };
