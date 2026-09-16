import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DESIGN_REVIEW_CORPUS,
	getClusterCounts,
	getMechanicallyCheckableCount,
	getPromptExamples,
	getReferenceFrameFindingCount,
	getReviewerVoicePrompt,
} from "./designReviewCorpus.ts";

describe("DESIGN_REVIEW_CORPUS", () => {
	/** 34 remarks, not 31: several pins carry more than one comment (the
	 * segmented control alone drew three), and each is stored separately
	 * because they land in different clusters. */
	it("holds every transcribed remark", () => {
		assert.equal(DESIGN_REVIEW_CORPUS.length, 34);
	});

	it("gives every finding a unique id", () => {
		const ids = DESIGN_REVIEW_CORPUS.map((finding) => finding.id);
		assert.equal(new Set(ids).size, ids.length);
	});

	it("never stores an empty quote — a paraphrased pin is a lost pin", () => {
		for (const finding of DESIGN_REVIEW_CORPUS) {
			assert.ok(finding.quote.trim().length > 0, `${finding.id} has no quote`);
		}
	});

	/**
	 * The load-bearing assertion of the whole module. If a finding is ever
	 * marked mechanically checkable, the claim in the module doc — that the
	 * hard-gate layer is at its useful limit — has stopped being true, and
	 * this test should fail loudly so someone goes and writes that gate.
	 */
	it("still finds nothing the mechanical gate layer could catch", () => {
		assert.equal(getMechanicallyCheckableCount(), 0);
	});

	it("records that the 'good' reference frame was flagged too", () => {
		assert.ok(
			getReferenceFrameFindingCount() > 0,
			"if no reference-frame pins remain, the 'no clean exemplar' finding no longer holds",
		);
	});

	it("ranks contrast and spacing as the two biggest clusters", () => {
		const counts = getClusterCounts();
		const ranked = Object.entries(counts).sort(([, a], [, b]) => b - a);
		assert.deepEqual(
			ranked.slice(0, 2).map(([cluster]) => cluster),
			["contrast-weight", "spacing"],
		);
	});
});

describe("getReviewerVoicePrompt", () => {
	it("quotes real pins verbatim", () => {
		const prompt = getReviewerVoicePrompt();
		assert.match(prompt, /Icons look darker than text/);
		assert.match(prompt, /why box in box\?/);
	});

	it("never repeats an unsettled question as if it were a rule", () => {
		const prompt = getReviewerVoicePrompt();
		assert.ok(!prompt.includes("Toggle should be on the left"));
		assert.ok(!prompt.includes("Do we like the shadow"));
		for (const finding of getPromptExamples()) {
			assert.notEqual(finding.cluster, "unsettled");
		}
	});

	it("says out loud that the flagged screens already used the right components", () => {
		assert.match(getReviewerVoicePrompt(), /already\s+used the right components/);
	});
});
