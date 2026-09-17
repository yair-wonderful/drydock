import type { DesignReview, PrototypeFile } from "@drydock/prototype";
import { request } from "./httpClient.ts";

export type GeneratedTree = {
	files: PrototypeFile[];
	entryPoint: string;
	totalBytes: number;
	/** Wonderful Design Guardrails v0's rubric self-review — advisory, never
	 * blocking. See docs/wonderful-design-guardrails.md. */
	review: DesignReview;
};

/** A fresh prototype from a plain-language description. */
export const generatePrototype = (prompt: string, entryPoint: string): Promise<GeneratedTree> =>
	request("/api/agent/generate", { method: "POST", body: { prompt, entryPoint } });

/** Rewrites the given tree per an instruction; returns the complete new tree. */
export const rewritePrototype = (
	files: PrototypeFile[],
	entryPoint: string,
	instruction: string,
): Promise<GeneratedTree> =>
	request("/api/agent/rewrite", { method: "POST", body: { files, entryPoint, instruction } });
