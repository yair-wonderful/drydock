import { validateFileTree, type ValidatedTree } from "@drydock/prototype";
import type OpenAI from "openai";
import { HttpError } from "../http/errors.ts";
import { getStructuredCompletion, type RawPrototypeTree } from "./openaiClient.ts";

/**
 * Turns the model's raw JSON into a stored-shape tree, or throws an
 * `HttpError` a route can hand straight to the client — the same
 * `validateFileTree` every other write path runs through, so a model that
 * emits too many files, an escaping path, or skips the requested entry point
 * is rejected here exactly as a hand-crafted request would be.
 *
 * `entryPoint` is the CALLER's requirement, not read off the model's
 * response — see `openaiClient.ts`'s schema comment for why the model isn't
 * asked to self-report one.
 */
const getValidatedOrThrow = (raw: RawPrototypeTree, entryPoint: string): ValidatedTree => {
	const result = validateFileTree(raw.files, entryPoint);
	if (!result.ok) {
		throw new HttpError(422, "agent_output_invalid", result.error.message, { path: result.error.path });
	}
	return result.value;
};

/**
 * One structured completion, with ONE retry that hands the model its own
 * invalid output and the validation error rather than silently giving up or
 * retrying blind. A model that ignores an explicit "no components outside
 * @wonderful/ui-base" instruction is not much more likely to ignore
 * "entry point 'src/App.tsx' is not in the tree, you produced these files:
 * ..." — but it is much more likely to fix a SPECIFIC, structured complaint
 * than to get it right by pure luck a second time.
 */
export const getValidatedTree = async (
	systemPrompt: string,
	userPrompt: string,
	entryPoint: string,
): Promise<ValidatedTree> => {
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
	if (firstAttempt.ok) {
		return firstAttempt.value;
	}

	messages.push(
		{ role: "assistant", content: JSON.stringify(raw) },
		{
			role: "user",
			content:
				`That tree is invalid: ${firstAttempt.error.message}` +
				(firstAttempt.error.path ? ` (path: ${firstAttempt.error.path})` : "") +
				". Fix it and return the complete corrected tree.",
		},
	);

	let retry: RawPrototypeTree;
	try {
		retry = await getStructuredCompletion(messages);
	} catch (error) {
		throw new HttpError(502, "agent_provider_error", error instanceof Error ? error.message : String(error));
	}
	return getValidatedOrThrow(retry, entryPoint);
};
