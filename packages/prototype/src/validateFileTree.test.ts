import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ENTRY_POINT, MAX_FILES, MAX_PATH_BYTES, MAX_VERSION_BYTES } from "./limits.ts";
import { getTotalBytes, validateFileTree } from "./validateFileTree.ts";
import type { PrototypeFile } from "./types.ts";

const file = (path: string, contents = "x"): PrototypeFile => ({ path, contents });

const expectFailure = (result: ReturnType<typeof validateFileTree>, code: string) => {
	assert.equal(result.ok, false, "expected the tree to be refused");
	if (!result.ok) {
		assert.equal(result.error.code, code);
	}
	return result.ok ? null : result.error;
};

describe("validateFileTree", () => {
	it("accepts a nested tree and keeps authoring order", () => {
		const result = validateFileTree([
			file("App.tsx", "export default function App() { return <Board /> }"),
			file("components/Board.tsx", "export default function Board() { return null }"),
			file("styles.css", ".board { display: grid }"),
		]);

		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.equal(result.value.entryPoint, DEFAULT_ENTRY_POINT);
		// Order survives the round trip: the tree is an array precisely so the
		// file list does not silently re-sort itself between write and read.
		assert.deepEqual(
			result.value.files.map((entry) => entry.path),
			["App.tsx", "components/Board.tsx", "styles.css"],
		);
	});

	it("refuses an empty tree", () => {
		expectFailure(validateFileTree([]), "files_required");
	});

	// The traversal table is the point of this whole file. Each of these, if
	// stored, becomes a key in a virtual filesystem the browser serves from, so
	// each has to be refused before it is written rather than normalised after.
	describe("refuses paths that escape, are absolute, or are not POSIX", () => {
		const cases: Record<string, string> = {
			"parent traversal": "../secrets.tsx",
			"nested traversal": "components/../../secrets.tsx",
			"bare parent segment": "..",
			absolute: "/etc/passwd",
			"absolute windows": "C:/Windows/system.ini",
			"backslash separator": "components\\Board.tsx",
			scheme: "https://example.com/x.tsx",
			"current dir segment": "./App.tsx",
			"double slash": "components//Board.tsx",
			"trailing slash": "components/",
			empty: "",
			"leading whitespace": " App.tsx",
			"trailing whitespace": "App.tsx ",
			newline: "App\n.tsx",
			"null byte": "App\u0000.tsx",
			del: "App\u007f.tsx",
		};

		for (const [name, path] of Object.entries(cases)) {
			it(name, () => {
				expectFailure(validateFileTree([file(path)], "App.tsx"), "invalid_file_path");
			});
		}
	});

	// Neither of these was expressible in the Go original. A Go string is bytes,
	// so an unpaired surrogate cannot occur and `len()` is already the byte
	// count; in JS both are real and both are silent if unchecked.
	describe("JavaScript-specific path hazards", () => {
		it("refuses a lone surrogate, which has no valid UTF-8 encoding", () => {
			expectFailure(validateFileTree([file("App\uD800.tsx")], "App.tsx"), "invalid_file_path");
		});

		it("measures path length in bytes, not UTF-16 units", () => {
			// 86 three-byte characters = 258 bytes but only 86 `.length`. The naive
			// check passes this; the storage column would not.
			const path = `${"あ".repeat(86)}.tsx`;
			assert.ok(path.length < MAX_PATH_BYTES, "precondition: short by .length");
			expectFailure(validateFileTree([file(path)], "App.tsx"), "invalid_file_path");
		});
	});

	it("refuses duplicate paths", () => {
		expectFailure(
			validateFileTree([file("App.tsx", "first"), file("App.tsx", "second")], "App.tsx"),
			"duplicate_file_path",
		);
	});

	it("refuses paths colliding only by case, naming both sides", () => {
		const error = expectFailure(
			validateFileTree([file("App.tsx", "first"), file("app.tsx", "second")], "App.tsx"),
			"duplicate_file_path",
		);
		// The message names both, because "duplicate path" is baffling when the
		// two paths do not look alike on screen.
		assert.match(error?.message ?? "", /app\.tsx/);
	});

	it("refuses too many files", () => {
		const files = Array.from({ length: MAX_FILES + 1 }, (_, index) =>
			file(`${"a".repeat(index + 1)}.tsx`),
		);
		expectFailure(validateFileTree(files, files[0].path), "too_many_files");
	});

	it("accepts exactly the file cap", () => {
		const files = Array.from({ length: MAX_FILES }, (_, index) =>
			file(`${"a".repeat(index + 1)}.tsx`),
		);
		assert.equal(validateFileTree(files, files[0].path).ok, true);
	});

	it("refuses one byte over the size cap", () => {
		// The boundary is asserted rather than assumed — this is the check that
		// keeps an oversized tree out of a row.
		const oversized = "a".repeat(MAX_VERSION_BYTES + 1);
		expectFailure(validateFileTree([file("App.tsx", oversized)], "App.tsx"), "source_too_large");
	});

	it("accepts a tree exactly at the size cap", () => {
		const atCap = "a".repeat(MAX_VERSION_BYTES);
		assert.equal(validateFileTree([file("App.tsx", atCap)], "App.tsx").ok, true);
	});

	it("sums size across files rather than checking each", () => {
		// Each file is under the cap; together they are not. A per-file check
		// would pass this and store twice the ceiling.
		const half = "a".repeat(Math.floor(MAX_VERSION_BYTES / 2) + 1);
		expectFailure(
			validateFileTree([file("a.tsx", half), file("b.tsx", half)], "a.tsx"),
			"source_too_large",
		);
	});

	it("counts contents in bytes, not UTF-16 units", () => {
		// Same trap as the path length, on the other axis.
		assert.equal(getTotalBytes([file("a.tsx", "あ")]), 3);
	});

	it("refuses an entry point that is not in the tree", () => {
		const error = expectFailure(
			validateFileTree([file("Board.tsx")], "App.tsx"),
			"entry_point_missing",
		);
		// The reason has to survive: the caller is often an agent, and
		// "entry point App.tsx is not in the tree" is actionable where
		// "invalid" is not.
		assert.match(error?.message ?? "", /App\.tsx/);
	});

	it("refuses the default entry point when it is absent", () => {
		// Defaulting is not a licence to skip the check — a tree with no App.tsx
		// and no explicit entry point can never be rendered.
		expectFailure(validateFileTree([file("Board.tsx")]), "entry_point_missing");
	});

	it("refuses an entry point that escapes", () => {
		expectFailure(validateFileTree([file("App.tsx")], "../App.tsx"), "invalid_file_path");
	});

	it("keeps and trims an explicit entry point", () => {
		const result = validateFileTree([file("src/Main.tsx")], "  src/Main.tsx  ");
		assert.equal(result.ok, true);
		if (result.ok) {
			assert.equal(result.value.entryPoint, "src/Main.tsx");
		}
	});

	it("reports the offending path on the error", () => {
		const error = expectFailure(
			validateFileTree([file("../escape.tsx")], "App.tsx"),
			"invalid_file_path",
		);
		// Carried as data so the editor can point at the file rather than parse
		// the message.
		assert.equal(error?.path, "../escape.tsx");
	});
});
