import { asRecord, getOptionalString, getRequiredFiles, getRequiredString } from "../http/body.ts";
import { withRoute } from "../http/respond.ts";
import type { Router } from "../http/router.ts";
import { generatePrototype } from "./generatePrototype.ts";
import { rewritePrototype } from "./rewritePrototype.ts";

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
			return generatePrototype(prompt, entryPoint);
		}),
	);

	router.post(
		"/api/agent/rewrite",
		withRoute(async (_req, _params, body) => {
			const record = asRecord(body);
			const files = getRequiredFiles(record);
			const entryPoint = getRequiredString(record, "entryPoint");
			const instruction = getRequiredString(record, "instruction");
			return rewritePrototype(files, entryPoint, instruction);
		}),
	);
};
