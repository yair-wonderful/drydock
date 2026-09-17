import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { generatePrototype } from "./generatePrototype.ts";
import type { RawPrototypeTree } from "./openaiClient.ts";
import { rewritePrototype } from "./rewritePrototype.ts";

type CompletionRequest = {
	messages: { role: string; content: string }[];
};

const originalEnv = { ...process.env };

const readBody = (request: IncomingMessage): Promise<string> =>
	new Promise((resolve, reject) => {
		let body = "";
		request.setEncoding("utf8");
		request.on("data", (chunk) => {
			body += chunk;
		});
		request.on("end", () => resolve(body));
		request.on("error", reject);
	});

const mandatoryStateVisibilityFix: RawPrototypeTree["review"]["rubric"]["critique"][number] = {
	dimension: "state-visibility",
	observation: "Operational rows include explicit status and recovery copy.",
	problem: "Without those labels, users would not know whether the agent is proposing or executing.",
	fix: "Keep the state labels adjacent to the affected rows.",
	severity: "minor",
};

const review = (
	purpose: string,
	critique: RawPrototypeTree["review"]["rubric"]["critique"] = [],
): RawPrototypeTree["review"] => ({
	purpose,
	primaryAction: "Review the agent work and decide the next step.",
	componentsUsed: ["Layout.Stack", "Card", "Badge", "Button"],
	mockData: "Static Wonderful agent-operations rows for this smoke test.",
	knownGaps: ["Persistence, permissions, and live task updates are mocked."],
	rubric: {
		contrastLadder: "strong",
		spacingRhythm: "strong",
		affordanceClarity: "strong",
		containerDepth: "strong",
		componentProvenance: "strong",
		agentLineage: "Each agent claim has a visible source/evidence label beside it.",
		stateCoverage: "The screen names empty, loading, error, success, disabled, and needs-attention states.",
		critique,
	},
});

const invalidFirstAttempt: RawPrototypeTree = {
	files: [
		{
			path: "src/App.tsx",
			contents: `export default function App() {
	fetch("/api/agent/tasks");
	return <main>Agent Ops Review</main>;
}
`,
		},
	],
	review: review("An intentionally invalid first attempt for guardrail retry coverage."),
};

const generatedTree: RawPrototypeTree = {
	files: [
		{
			path: "src/App.tsx",
			contents: `const rows = ["Escalation triage", "Policy check", "Draft approval"];

export default function App() {
	return (
		<main className="p-6">
			<h1>Agent Ops Review</h1>
			<p>Source evidence is visible before approval.</p>
			<section>
				{rows.map((row) => (
					<article key={row}>
						<h2>{row}</h2>
						<p>Live status, draft status, and needs-attention state are distinct.</p>
						<p>Empty/loading/error notes stay near the affected task.</p>
						<a href="#evidence">Open evidence</a>
					</article>
				))}
			</section>
		</main>
	);
}
`,
		},
	],
	review: review("A compact Wonderful agent-operations review panel.", [mandatoryStateVisibilityFix]),
};

const reviewFixedGeneratedTree: RawPrototypeTree = {
	files: [
		{
			path: "src/App.tsx",
			contents: generatedTree.files[0]!.contents.replace(
				"Empty/loading/error notes stay near the affected task.",
				"Empty/loading/error notes stay adjacent to the affected task. Mandatory review fixes applied.",
			),
		},
	],
	review: review("The generated panel after mandatory self-review fixes."),
};

const rewrittenTree: RawPrototypeTree = {
	files: [
		{
			path: "src/App.tsx",
			contents: reviewFixedGeneratedTree.files[0]!.contents.replace("Agent Ops Review", "Agent Ops Review Live"),
		},
	],
	review: review("The generated panel after a title-only rewrite."),
};

describe("agent loop E2E", () => {
	const requests: CompletionRequest[] = [];
	const responses = [invalidFirstAttempt, generatedTree, reviewFixedGeneratedTree, rewrittenTree];
	let server: ReturnType<typeof createServer>;
	let baseURL = "";

	before(async () => {
		server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
			if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
				response.writeHead(404, { "content-type": "application/json" });
				response.end(JSON.stringify({ error: { message: "not found" } }));
				return;
			}

			requests.push(JSON.parse(await readBody(request)) as CompletionRequest);
			const content = responses[requests.length - 1];
			if (!content) {
				response.writeHead(500, { "content-type": "application/json" });
				response.end(JSON.stringify({ error: { message: "unexpected extra completion" } }));
				return;
			}

			response.writeHead(200, { "content-type": "application/json" });
			response.end(
				JSON.stringify({
					id: `chatcmpl-test-${requests.length}`,
					object: "chat.completion",
					created: 0,
					model: "agent-loop-e2e",
					choices: [
						{
							index: 0,
							finish_reason: "stop",
							message: { role: "assistant", content: JSON.stringify(content) },
						},
					],
				}),
			);
		});

		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address() as AddressInfo;
		baseURL = `http://127.0.0.1:${address.port}/v1`;
	});

	after(async () => {
		for (const key of Object.keys(process.env)) {
			delete process.env[key];
		}
		Object.assign(process.env, originalEnv);
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	});

	it("generates, fixes self-review findings, then rewrites a validated tree", async () => {
		process.env.OPENAI_API_KEY = "local-e2e-key";
		process.env.OPENAI_BASE_URL = baseURL;
		process.env.OPENAI_MODEL = "agent-loop-e2e";

		const generated = await generatePrototype(
			"Build a compact Wonderful agent operations review panel named Agent Ops Review.",
			"src/App.tsx",
		);

		assert.equal(generated.tree.entryPoint, "src/App.tsx");
		assert.equal(generated.tree.files.length, 1);
		assert.match(generated.tree.files[0]!.contents, /Mandatory review fixes applied/);
		assert.match(generated.review.rubric.stateCoverage, /loading/);
		assert.equal(generated.review.rubric.critique.length, 0);

		const rewritten = await rewritePrototype(
			generated.tree.files,
			generated.tree.entryPoint,
			"Change the page title to Agent Ops Review Live.",
		);

		assert.match(rewritten.tree.files[0]!.contents, /Agent Ops Review Live/);
		assert.equal(requests.length, 4);
		assert.match(requests[0]!.messages[0]!.content, /UX review discipline/);
		assert.match(requests[1]!.messages.at(-1)!.content, /violates the Wonderful Design Guardrails/);
		assert.match(requests[1]!.messages.at(-1)!.content, /no-real-network-calls/);
		assert.match(requests[2]!.messages.at(-1)!.content, /mandatory before returning/);
		assert.match(requests[2]!.messages.at(-1)!.content, /Keep the state labels adjacent/);
		assert.match(requests[3]!.messages[1]!.content, /Mandatory review fixes applied/);
		assert.match(requests[3]!.messages[1]!.content, /Change the page title to Agent Ops Review Live/);
	});
});
