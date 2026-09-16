import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getFilesFromTree, getTreeFromFiles, HARNESS_ENTRY_POINT } from "./convertTree.ts";

describe("convertTree", () => {
	it("round-trips a tree through files and back unchanged", () => {
		const tree = {
			"src/index.tsx": "entry",
			"src/Dashboard.tsx": "dashboard",
			"src/MetricCard.tsx": "card",
		};
		assert.deepEqual(getTreeFromFiles(getFilesFromTree(tree)), tree);
	});

	it("preserves insertion order through the array form", () => {
		// The claim this locks in: object key order is not "usually fine", it is
		// spec-guaranteed for non-integer-like string keys, which is every path
		// this app ever produces.
		const tree = {
			"z.tsx": "last-inserted-key-alphabetically-first",
			"a.tsx": "first-inserted-key-alphabetically-last",
		};
		const files = getFilesFromTree(tree);
		assert.deepEqual(
			files.map((file) => file.path),
			["z.tsx", "a.tsx"],
		);
	});

	it("uses the harness's own entry point convention, not the shared package's default", () => {
		// @drydock/prototype defaults to "App.tsx" when a caller omits an entry
		// point. This app never omits one, and its own convention is different —
		// this assertion is what would catch the two silently drifting apart.
		assert.equal(HARNESS_ENTRY_POINT, "src/index.tsx");
	});

	it("handles an empty tree", () => {
		assert.deepEqual(getFilesFromTree({}), []);
		assert.deepEqual(getTreeFromFiles([]), {});
	});
});
