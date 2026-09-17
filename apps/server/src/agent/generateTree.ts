import { validateFileTree, type CritiqueFinding, type DesignReview, type ValidatedTree } from "@drydock/prototype";
import type OpenAI from "openai";
import { checkDesignGuardrails, getGuardrailViolationSummary } from "./designGuardrails.ts";
import { HttpError } from "../http/errors.ts";
import { getStructuredCompletion, type RawPrototypeTree } from "./openaiClient.ts";

export type GenerationResult = {
	tree: ValidatedTree;
	review: DesignReview;
};

const getReviewFixList = (critique: readonly CritiqueFinding[]): string =>
	critique
		.map(
			(finding, index) =>
				`${index + 1}. ${finding.severity.toUpperCase()} ${finding.dimension}\n` +
				`   Problem: ${finding.problem}\n` +
				`   Required fix: ${finding.fix}`,
		)
		.join("\n");

/**
 * The self-review is not just a side panel: any critique findings it emits are
 * treated as work still to do. This prompt is a bounded second pass, not an
 * infinite quality loop — the model applies the concrete fixes it named, then
 * returns the complete corrected tree plus a fresh review of the corrected
 * result.
 */
export const getMandatoryReviewFixPrompt = (critique: readonly CritiqueFinding[]): string =>
	`The design self-review found fixes that are mandatory before returning this prototype.\n\n` +
	`Apply every concrete fix below to the current tree:\n\n${getReviewFixList(critique)}\n\n` +
	`Return the COMPLETE corrected tree, every file, not a diff. ` +
	`Update the design review to describe the corrected result. ` +
	`Do not keep a critique item after its fix has been applied; only report findings that genuinely remain.`;

/**
 * Turns the model's raw JSON into a stored-shape tree plus its design
 * review, or throws an `HttpError` a route can hand straight to the client.
 * Two checks, in order: `validateFileTree` (the same one every other write
 * path in this repo goes through — file count, path safety, size, entry
 * point), then the Wonderful Design Guardrails' mechanical hard gates
 * (`checkDesignGuardrails`) — a tree can be a perfectly valid shape and
 * still import a random npm package or leave a form input unlabeled.
 */
const getValidatedOrThrow = (raw: RawPrototypeTree, entryPoint: string): GenerationResult => {
	const result = validateFileTree(raw.files, entryPoint);
	if (!result.ok) {
		throw new HttpError(422, "agent_output_invalid", result.error.message, { path: result.error.path });
	}
	const violations = checkDesignGuardrails(result.value.files);
	if (violations.length > 0) {
		throw new HttpError(422, "design_guardrails_violated", getGuardrailViolationSummary(violations), {
			violations,
		});
	}
	return { tree: result.value, review: raw.review };
};

/**
 * One structured completion, with ONE retry that hands the model its own
 * invalid output and the SPECIFIC failure — a shape error from
 * `validateFileTree`, or a guardrail violation list — rather than silently
 * giving up or retrying blind. A model that ignores an explicit "no
 * components outside @wonderful/ui-base" instruction is not much more likely
 * to ignore "entry point 'src/App.tsx' is not in the tree" or "[no-external-
 * libraries] src/index.tsx: imports 'date-fns'" — but it is much more likely
 * to fix a SPECIFIC, structured complaint than to get it right by pure luck
 * a second time.
 */
export const getValidatedTree = async (
	systemPrompt: string,
	userPrompt: string,
	entryPoint: string,
): Promise<GenerationResult> => {
	const messages: OpenAI.ChatCompletionMessageParam[] = [
		{ role: "system", content: systemPrompt },
		{
			role: "user",
			content: `${userPrompt}\n\nThe entry point file must be named exactly: ${entryPoint}`,
		},
	];

	let raw: RawPrototypeTree;
	try {
		raw = await getStructuredCompletion(messages);
	} catch (error) {
		throw new HttpError(502, "agent_provider_error", error instanceof Error ? error.message : String(error));
	}

	const firstAttempt = validateFileTree(raw.files, entryPoint);
	const firstViolations = firstAttempt.ok ? checkDesignGuardrails(firstAttempt.value.files) : [];
	if (firstAttempt.ok && firstViolations.length === 0) {
		return getReviewFixedTreeIfNeeded(messages, raw, { tree: firstAttempt.value, review: raw.review }, entryPoint);
	}

	const feedback = !firstAttempt.ok
		? `That tree is invalid: ${firstAttempt.error.message}` +
			(firstAttempt.error.path ? ` (path: ${firstAttempt.error.path})` : "")
		: `That tree violates the Wonderful Design Guardrails:\n${getGuardrailViolationSummary(firstViolations)}`;

	messages.push(
		{ role: "assistant", content: JSON.stringify(raw) },
		{ role: "user", content: `${feedback}\n\nFix it and return the complete corrected tree.` },
	);

	let retry: RawPrototypeTree;
	try {
		retry = await getStructuredCompletion(messages);
	} catch (error) {
		throw new HttpError(502, "agent_provider_error", error instanceof Error ? error.message : String(error));
	}
	const validatedRetry = getValidatedOrThrow(retry, entryPoint);
	return getReviewFixedTreeIfNeeded(messages, retry, validatedRetry, entryPoint);
};

const getReviewFixedTreeIfNeeded = async (
	messages: OpenAI.ChatCompletionMessageParam[],
	raw: RawPrototypeTree,
	validated: GenerationResult,
	entryPoint: string,
): Promise<GenerationResult> => {
	const critique = validated.review.rubric.critique;
	if (critique.length === 0) {
		return validated;
	}

	messages.push(
		{ role: "assistant", content: JSON.stringify(raw) },
		{ role: "user", content: getMandatoryReviewFixPrompt(critique) },
	);

	let fixed: RawPrototypeTree;
	try {
		fixed = await getStructuredCompletion(messages);
	} catch (error) {
		throw new HttpError(502, "agent_provider_error", error instanceof Error ? error.message : String(error));
	}
	return getValidatedOrThrow(fixed, entryPoint);
};
