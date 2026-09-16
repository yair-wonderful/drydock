/**
 * Before/after comparison for Wonderful Design Guardrails v0, against a
 * fixed prompt chosen to match the audience the guardrails doc targets: an
 * internal platform-team screen, not a landing page.
 *
 *   node --env-file-if-exists=.env scripts/goldenPrompt.ts             # v0 (guardrails on)
 *   node --env-file-if-exists=.env scripts/goldenPrompt.ts --baseline  # pre-guardrails prompt
 *
 * Requires OPENAI_API_KEY. Prints the generated tree; v0 mode also prints
 * the design self-review and reports whether any hard gate fired (and the
 * retry it triggered). Baseline mode runs the SAME structured-output call
 * against `BASE_SYSTEM_PROMPT` (the rules-and-example prompt with the
 * guardrails section removed) and skips `checkDesignGuardrails` entirely —
 * this is a real before/after, not a description of one.
 */
import { DEFAULT_ENTRY_POINT, validateFileTree } from "@drydock/prototype";
import { checkDesignGuardrails, getGuardrailViolationSummary } from "../src/agent/designGuardrails.ts";
import { generatePrototype } from "../src/agent/generatePrototype.ts";
import { getStructuredCompletion } from "../src/agent/openaiClient.ts";
import { BASE_SYSTEM_PROMPT } from "../src/agent/systemPrompt.ts";

const GOLDEN_PROMPT = "mock up an Agent Studio settings screen";

const printTree = (files: { path: string; contents: string }[]): void => {
	for (const file of files) {
		console.log(`\n--- ${file.path} ---`);
		console.log(file.contents);
	}
};

const runBaseline = async (): Promise<void> => {
	console.log(`Baseline (pre-guardrails) — prompt: "${GOLDEN_PROMPT}"\n`);
	const raw = await getStructuredCompletion([
		{ role: "system", content: BASE_SYSTEM_PROMPT },
		{ role: "user", content: `Build a prototype: ${GOLDEN_PROMPT}\n\nThe entry point file must be named exactly: ${DEFAULT_ENTRY_POINT}` },
	]);
	const result = validateFileTree(raw.files, DEFAULT_ENTRY_POINT);
	if (!result.ok) {
		console.log(`validateFileTree FAILED: ${result.error.message}`);
		return;
	}
	printTree([...result.value.files]);

	const violations = checkDesignGuardrails(result.value.files);
	console.log(
		violations.length === 0
			? "\n(would have passed the v0 hard gates anyway)"
			: `\nWould have FAILED ${violations.length} v0 hard gate(s) had they been on:\n${getGuardrailViolationSummary(violations)}`,
	);
};

const runV0 = async (): Promise<void> => {
	console.log(`Guardrails v0 — prompt: "${GOLDEN_PROMPT}"\n`);
	const { tree, review } = await generatePrototype(GOLDEN_PROMPT);
	printTree([...tree.files]);
	console.log("\n--- design self-review ---");
	console.log(JSON.stringify(review, null, 2));
};

const isBaseline = process.argv.includes("--baseline");
await (isBaseline ? runBaseline() : runV0());
