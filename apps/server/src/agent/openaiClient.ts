import type { DesignReview } from "@drydock/prototype";
import OpenAI from "openai";

/**
 * The model, not hard-coded: an internal tool's code-gen quality/cost trade-off
 * is exactly the kind of thing worth changing without a deploy.
 */
const DEFAULT_MODEL = "gpt-4.1";

const getApiKey = (): string => {
	const key = process.env.OPENAI_API_KEY;
	if (!key) {
		throw new Error("OPENAI_API_KEY is not set");
	}
	return key;
};

let shared: OpenAI | null = null;

/** The process-wide client — a `get*` since the SDK's own instance holds no
 * per-request state worth isolating, unlike `apps/server/src/db/connect.ts`'s
 * pool (which tests deliberately need their own copy of). */
export const getOpenAiClient = (): OpenAI => {
	shared ??= new OpenAI({ apiKey: getApiKey(), timeout: 120_000 });
	return shared;
};

export const getModel = (): string => process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

const GUARDRAIL_FIT_RATING_ENUM = ["strong", "medium", "weak"] as const;

/**
 * The shape the model must return — a file array plus its own design
 * self-review (Wonderful Design Guardrails v0's rubric layer; see
 * `designGuardrails.ts`). Enforced by the API itself
 * (`response_format: json_schema, strict: true`), which is what makes
 * `JSON.parse` on the response trustworthy without a hand-rolled shape check
 * before `validateFileTree` gets to do the check that matters.
 *
 * No `entryPoint` field: the caller (not the model) decides what the entry
 * point is named — the prompt tells the model exactly which path to use for
 * it, and validation checks the model actually did, rather than trusting a
 * self-reported field that could disagree with what it actually wrote.
 */
export const PROTOTYPE_TREE_SCHEMA = {
	type: "object",
	properties: {
		files: {
			type: "array",
			items: {
				type: "object",
				properties: {
					path: { type: "string" },
					contents: { type: "string" },
				},
				required: ["path", "contents"],
				additionalProperties: false,
			},
		},
		review: {
			type: "object",
			properties: {
				purpose: { type: "string" },
				primaryAction: { type: "string" },
				componentsUsed: { type: "array", items: { type: "string" } },
				mockData: { type: "string" },
				knownGaps: { type: "array", items: { type: "string" } },
				rubric: {
					type: "object",
					properties: {
						contrastLadder: { type: "string", enum: GUARDRAIL_FIT_RATING_ENUM },
						spacingRhythm: { type: "string", enum: GUARDRAIL_FIT_RATING_ENUM },
						affordanceClarity: { type: "string", enum: GUARDRAIL_FIT_RATING_ENUM },
						containerDepth: { type: "string", enum: GUARDRAIL_FIT_RATING_ENUM },
						componentProvenance: { type: "string", enum: GUARDRAIL_FIT_RATING_ENUM },
						stateCoverage: { type: "string" },
						selfFlagged: { type: "array", items: { type: "string" } },
					},
					required: [
						"contrastLadder",
						"spacingRhythm",
						"affordanceClarity",
						"containerDepth",
						"componentProvenance",
						"stateCoverage",
						"selfFlagged",
					],
					additionalProperties: false,
				},
			},
			required: ["purpose", "primaryAction", "componentsUsed", "mockData", "knownGaps", "rubric"],
			additionalProperties: false,
		},
	},
	required: ["files", "review"],
	additionalProperties: false,
} as const;

export type RawPrototypeTree = {
	files: { path: string; contents: string }[];
	review: DesignReview;
};

/**
 * One structured-output chat completion, parsed but not yet validated —
 * `validateFileTree` (the same check every other write path goes through) is
 * the caller's job, not this client's.
 */
export const getStructuredCompletion = async (messages: OpenAI.ChatCompletionMessageParam[]): Promise<RawPrototypeTree> => {
	const client = getOpenAiClient();
	let response: OpenAI.ChatCompletion;
	try {
		response = await client.chat.completions.create({
			model: getModel(),
			messages,
			response_format: {
				type: "json_schema",
				json_schema: { name: "prototype_tree", strict: true, schema: PROTOTYPE_TREE_SCHEMA },
			},
		});
	} catch (error) {
		throw new Error(`OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`);
	}

	const content = response.choices[0]?.message.content;
	if (!content) {
		throw new Error("OpenAI returned no content");
	}
	return JSON.parse(content) as RawPrototypeTree;
};
