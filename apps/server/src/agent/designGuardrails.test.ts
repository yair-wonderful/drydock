import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkDesignGuardrails } from "./designGuardrails.ts";

const okFile = (contents: string) => [{ path: "src/index.tsx", contents }];

describe("checkDesignGuardrails", () => {
	it("passes a clean, real-shaped component with no violations", () => {
		const violations = checkDesignGuardrails([
			{
				path: "src/index.tsx",
				contents: `import Dashboard from "./Dashboard";\n\nexport default function Prototype() {\n\treturn <Dashboard />;\n}\n`,
			},
			{
				path: "src/Dashboard.tsx",
				contents: `import { Card, Layout, Text, Button, Tag } from "@wonderful/ui-base";\nimport agents from "./agents.json";\n\nexport default function Dashboard() {\n\treturn (\n\t\t<Layout.Stack gap="lg" className="p-8">\n\t\t\t<Text variant="heading-1">Voice agents</Text>\n\t\t\t<Button>New agent</Button>\n\t\t</Layout.Stack>\n\t);\n}\n`,
			},
			{ path: "src/agents.json", contents: `[{"name":"a"},{"name":"b"},{"name":"c"},{"name":"d"}]` },
		]);
		assert.deepEqual(violations, []);
	});

	it("flags an import from outside the allowlist", () => {
		const violations = checkDesignGuardrails(okFile(`import { format } from "date-fns";\n`));
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "no-external-libraries");
	});

	it("allows react, @wonderful/ui-base, and relative imports", () => {
		const violations = checkDesignGuardrails(
			okFile(
				`import { useState } from "react";\nimport { Card } from "@wonderful/ui-base";\nimport Helper from "./Helper";\nimport data from "../shared/data.json";\n`,
			),
		);
		assert.deepEqual(violations, []);
	});

	it("flags a real network call", () => {
		const violations = checkDesignGuardrails(okFile(`fetch("/api/agents").then((r) => r.json());\n`));
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "no-real-network-calls");
	});

	it("flags a WebSocket the same way", () => {
		const violations = checkDesignGuardrails(okFile(`const socket = new WebSocket("wss://example");\n`));
		assert.equal(violations[0].rule, "no-real-network-calls");
	});

	it("flags an inline style", () => {
		const violations = checkDesignGuardrails(okFile(`<div style={{ padding: 8 }} />;\n`));
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "no-inline-styles");
	});

	it("flags a self-closing input with no accessible name", () => {
		const violations = checkDesignGuardrails(okFile(`<Input value={x} onChange={set} />;\n`));
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "no-unlabeled-inputs");
	});

	it("allows an input with an aria-label", () => {
		const violations = checkDesignGuardrails(okFile(`<Input aria-label="Search" value={x} onChange={set} />;\n`));
		assert.deepEqual(violations, []);
	});

	it("flags a self-closing icon-only button with no aria-label", () => {
		const violations = checkDesignGuardrails(okFile(`<Button icon={<Trash />} onClick={remove} />;\n`));
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "no-inaccessible-icon-controls");
	});

	it("does not flag a button with visible text children", () => {
		const violations = checkDesignGuardrails(okFile(`<Button onClick={save}>Save</Button>;\n`));
		assert.deepEqual(violations, []);
	});

	it("flags an inline array of three or more records in a component file", () => {
		const violations = checkDesignGuardrails(
			okFile(`const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];\n`),
		);
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "mock-data-separated");
	});

	it("does not flag an inline array of records inside a .json or *Data.ts file", () => {
		const violations = checkDesignGuardrails([
			{ path: "src/agents.json", contents: `[{"id":1},{"id":2},{"id":3},{"id":4}]` },
			{ path: "src/agentsData.ts", contents: `export const rows = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];\n` },
		]);
		assert.deepEqual(violations, []);
	});

	it("attributes each violation to the file it was found in", () => {
		const violations = checkDesignGuardrails([
			{ path: "src/index.tsx", contents: `import x from "left-pad";\n` },
			{ path: "src/Other.tsx", contents: `export default function Other() { return null; }\n` },
		]);
		assert.equal(violations.length, 1);
		assert.equal(violations[0].file, "src/index.tsx");
	});
});
