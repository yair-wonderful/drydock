import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRewriteUserPrompt } from "./systemPrompt.ts";

describe("getRewriteUserPrompt", () => {
	it("lists every file with its own contents", () => {
		const prompt = getRewriteUserPrompt(
			[
				{ path: "src/index.tsx", contents: "export default function App() {}" },
				{ path: "src/Card.tsx", contents: "export default function Card() {}" },
			],
			"add a header",
		);
		assert.match(prompt, /--- src\/index\.tsx ---\nexport default function App/);
		assert.match(prompt, /--- src\/Card\.tsx ---\nexport default function Card/);
	});

	it("includes the instruction verbatim", () => {
		const prompt = getRewriteUserPrompt(
			[{ path: "src/index.tsx", contents: "x" }],
			"rename the button to Continue",
		);
		assert.match(prompt, /rename the button to Continue/);
	});

	it("asks for the complete tree, not a diff", () => {
		const prompt = getRewriteUserPrompt([{ path: "src/index.tsx", contents: "x" }], "anything");
		assert.match(prompt, /COMPLETE rewritten tree/);
	});
});
