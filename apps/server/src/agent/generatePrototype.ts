import type { ValidatedTree } from "@drydock/prototype";
import { DEFAULT_ENTRY_POINT } from "@drydock/prototype";
import { getValidatedTree } from "./generateTree.ts";
import { SYSTEM_PROMPT } from "./systemPrompt.ts";

/** A fresh prototype from a plain-language description. */
export const generatePrototype = (prompt: string, entryPoint = DEFAULT_ENTRY_POINT): Promise<ValidatedTree> =>
	getValidatedTree(SYSTEM_PROMPT, `Build a prototype: ${prompt}`, entryPoint);
