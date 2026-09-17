import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { UX_REVIEW_DISCIPLINE, UX_REVIEW_DISCIPLINE_PROMPT } from "./uxReviewDiscipline.ts";

const FORBIDDEN_SOURCE_RESIDUE = new RegExp(
	String.raw`\b(?:${[
		"Gue" + "sty",
		"Fig" + "ma",
		"Str" + "ipe",
		"Har" + "bor",
		"Air" + "bnb",
		"Ex" + "pedia",
		"get_" + "metadata",
		"get_" + "design_context",
		"search_" + "design_system",
		"knowledge" + "/",
		"Mentor's" + " Overview",
	].join("|")})\b`,
	"i",
);

const FORBIDDEN_SOURCE_RESIDUE_CASE_SENSITIVE = new RegExp(
	String.raw`\b(?:${["P" + "MS", "O" + "TA"].join("|")}|D[1-6]|P\d+)\b`,
);

const readRepoFile = (relativePath: string): string =>
	readFileSync(new URL(`../../../../${relativePath}`, import.meta.url), "utf8");

describe("UX review discipline", () => {
	it("keeps the uploaded review material as a compact Wonderful-only rubric layer", () => {
		assert.equal(UX_REVIEW_DISCIPLINE.length, 7);
		assert.match(UX_REVIEW_DISCIPLINE_PROMPT, /not hard gates/i);
		assert.match(UX_REVIEW_DISCIPLINE_PROMPT, /state machine/i);
		assert.match(UX_REVIEW_DISCIPLINE_PROMPT, /where am I/i);
		assert.match(UX_REVIEW_DISCIPLINE_PROMPT, /Friction follows reversibility/i);
		assert.match(UX_REVIEW_DISCIPLINE_PROMPT, /Permission-aware surfaces/i);
		assert.match(UX_REVIEW_DISCIPLINE_PROMPT, /decision gates/i);
	});

	it("keeps every area documented by concrete checks", () => {
		for (const area of UX_REVIEW_DISCIPLINE) {
			assert.ok(area.id.length > 0, "area needs an id");
			assert.ok(area.name.length > 0, `${area.id} needs a name`);
			assert.ok(area.checks.length >= 3, `${area.id} needs concrete checks`);
			for (const check of area.checks) {
				assert.ok(check.length > 20, `${area.id} has a vague check: ${check}`);
			}
		}
	});

	it("strips source-company, source-tool, and foreign-domain residue from exported guardrail material", () => {
		const texts = [
			UX_REVIEW_DISCIPLINE_PROMPT,
			JSON.stringify(UX_REVIEW_DISCIPLINE),
			readRepoFile("docs/wonderful-design-guardrails.md"),
			readRepoFile("scripts/exportGuardrails.ts"),
		];
		for (const text of texts) {
			assert.doesNotMatch(text, FORBIDDEN_SOURCE_RESIDUE);
			assert.doesNotMatch(text, FORBIDDEN_SOURCE_RESIDUE_CASE_SENSITIVE);
		}
	});
});
