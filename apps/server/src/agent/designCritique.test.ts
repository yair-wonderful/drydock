import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESIGN_REVIEW_CORPUS } from "./designReviewCorpus.ts";
import { ALL_CRITIQUE_DIMENSIONS, CRITIQUE_DIMENSIONS_BY_LENS, CRITIQUE_PROMPT } from "./designCritique.ts";

describe("critique dimensions", () => {
	it("carries all 20 skill dimensions plus the corpus-sourced one", () => {
		assert.equal(ALL_CRITIQUE_DIMENSIONS.length, 21);
	});

	it("keeps every dimension unique", () => {
		assert.equal(new Set(ALL_CRITIQUE_DIMENSIONS).size, ALL_CRITIQUE_DIMENSIONS.length);
	});

	it("covers all five critique-* lenses", () => {
		assert.deepEqual(Object.keys(CRITIQUE_DIMENSIONS_BY_LENS).sort(), [
			"affordance",
			"composition",
			"information-density",
			"typography",
			"visual-hierarchy",
		]);
	});

	/**
	 * The corpus's contrast complaints ("Placeholder too light", "Too dark")
	 * are not WCAG failures — they're about the 3-step ladder and about
	 * siblings inside one control disagreeing. `critique-typography` only
	 * covers contrast as an AA threshold, so this dimension exists to close
	 * that gap. If it ever disappears, the biggest corpus cluster loses its
	 * critique dimension.
	 */
	it("keeps a contrast dimension the critique skills did not supply", () => {
		assert.ok(ALL_CRITIQUE_DIMENSIONS.includes("contrast-ladder"));
	});

	it("names every dimension in the prompt it hands the model", () => {
		for (const dimension of ALL_CRITIQUE_DIMENSIONS) {
			assert.ok(CRITIQUE_PROMPT.includes(`\`${dimension}\``), `${dimension} missing from CRITIQUE_PROMPT`);
		}
	});

	it("asks for findings only, not a rating for every dimension", () => {
		assert.match(CRITIQUE_PROMPT, /ONLY dimensions where/);
	});
});

describe("critique coverage of the review corpus", () => {
	/**
	 * The corpus is the ground truth for what a Wonderful reviewer actually
	 * flags. Every cluster in it should have somewhere to land in the
	 * critique vocabulary — except `component-provenance`, which Drydock
	 * answers mechanically at compile time and carries as a rubric axis
	 * instead, and `unsettled`, which is open questions rather than defects.
	 */
	it("has a home for every corpus cluster that represents a real defect", () => {
		const clustersToDimensions: Record<string, string> = {
			"contrast-weight": "contrast-ladder",
			spacing: "whitespace",
			geometry: "rhythm",
			affordance: "clickability",
			"container-nesting": "gestalt",
			"state-legibility": "state-visibility",
		};
		const covered = new Set(Object.keys(clustersToDimensions));
		const uncovered = [...new Set(DESIGN_REVIEW_CORPUS.map((f) => f.cluster))].filter(
			(cluster) => !covered.has(cluster) && cluster !== "component-provenance" && cluster !== "unsettled",
		);
		assert.deepEqual(uncovered, [], `corpus clusters with no critique dimension: ${uncovered.join(", ")}`);

		for (const dimension of Object.values(clustersToDimensions)) {
			assert.ok(ALL_CRITIQUE_DIMENSIONS.includes(dimension as never), `${dimension} is not a real dimension`);
		}
	});
});
