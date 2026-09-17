import type { GenerationResult } from "./generateTree.ts";
import { asRecord, getOptionalString, getRequiredFiles, getRequiredString } from "../http/body.ts";
import { HttpError } from "../http/errors.ts";
import { withRoute } from "../http/respond.ts";
import type { Router } from "../http/router.ts";
import { generatePrototype } from "./generatePrototype.ts";
import { rewritePrototype } from "./rewritePrototype.ts";

/** Flattens `{ tree, review }` into one response body — the client wants a
 * tree it can hand to `getTreeFromFiles` directly, with `review` alongside. */
const getResponseBody = ({ tree, review }: GenerationResult) => ({ ...tree, review });

const getAgentHttpError = (operation: "generation" | "rewrite", error: unknown): HttpError => {
	if (error instanceof HttpError) {
		return error;
	}
	const reason = error instanceof Error ? error.message : String(error);
	if (reason.includes("OPENAI_API_KEY is not set")) {
		return new HttpError(
			503,
			"model_not_configured",
			`${operation} is not configured. Run \`pnpm run dev\` so the local model adapter is started and wired automatically.`,
			{ reason },
		);
	}
	if (reason.startsWith("Model request failed")) {
		return new HttpError(
			502,
			"model_request_failed",
			`${operation} could not complete the model request. Check the adapter line in the dev terminal.`,
			{ reason },
		);
	}
	return new HttpError(500, `${operation}_failed`, `${operation} failed`, { reason });
};

const withAgentFailure = async (
	operation: "generation" | "rewrite",
	work: () => Promise<GenerationResult>,
): Promise<ReturnType<typeof getResponseBody>> => {
	try {
		return getResponseBody(await work());
	} catch (error) {
		throw getAgentHttpError(operation, error);
	}
};

/**
 * The agent loop's HTTP surface: generate a tree from a prompt, or rewrite an
 * existing one per an instruction. Neither route touches the database —
 * they hand back a validated tree and let the caller decide whether (and
 * when) to persist it through the existing `/api/prototypes` routes. Keeping
 * "the model wrote something" and "we saved something" as separate steps
 * means a generation the author doesn't like never touches storage.
 */
export const registerAgentRoutes = (router: Router): void => {
	router.post(
		"/api/agent/generate",
		withRoute(async (_req, _params, body) => {
			const record = asRecord(body);
			const prompt = getRequiredString(record, "prompt");
			const entryPoint = getOptionalString(record, "entryPoint");
			return withAgentFailure("generation", () => generatePrototype(prompt, entryPoint));
		}),
	);

	router.post(
		"/api/agent/rewrite",
		withRoute(async (_req, _params, body) => {
			const record = asRecord(body);
			const files = getRequiredFiles(record);
			const entryPoint = getRequiredString(record, "entryPoint");
			const instruction = getRequiredString(record, "instruction");
			return withAgentFailure("rewrite", () => rewritePrototype(files, entryPoint, instruction));
		}),
	);
};
