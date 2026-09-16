import type { PrototypeFile, ValidatedTree } from "@drydock/prototype";
import { getValidatedTree } from "./generateTree.ts";
import { getRewriteUserPrompt, SYSTEM_PROMPT } from "./systemPrompt.ts";

/**
 * Rewrites a prototype's CURRENT tree in place, per a plain-language
 * instruction — the edit half of the loop, and the half that actually
 * exercises comment anchoring: the whole point of anchoring is surviving
 * exactly this, an AI rewrite of a tree someone already left comments on.
 */
export const rewritePrototype = (
	currentFiles: readonly PrototypeFile[],
	entryPoint: string,
	instruction: string,
): Promise<ValidatedTree> =>
	getValidatedTree(SYSTEM_PROMPT, getRewriteUserPrompt(currentFiles, instruction), entryPoint);
