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

	it("flags an uppercase Tailwind class", () => {
		const violations = checkDesignGuardrails(okFile(`<Text variant="label" className="uppercase tracking-wide">Status</Text>;\n`));
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "no-uppercase-text-transform");
	});

	it("flags a text-transform: uppercase declaration", () => {
		const violations = checkDesignGuardrails(okFile(`const label = "text-transform: uppercase";\n`));
		assert.equal(violations[0].rule, "no-uppercase-text-transform");
	});

	it("does not mistake the word 'uppercase' in ordinary copy for the class", () => {
		const violations = checkDesignGuardrails(okFile(`<Text variant="body">Names are matched without uppercase sensitivity</Text>;\n`));
		assert.deepEqual(violations, []);
	});

	it("flags a hex color", () => {
		const violations = checkDesignGuardrails(okFile(`<Tag color="#f43f5e" text="Failed" />;\n`));
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "no-hardcoded-colors");
	});

	it("flags a raw Tailwind color-shade class", () => {
		const violations = checkDesignGuardrails(okFile(`<Layout.Row className="text-gray-500">x</Layout.Row>;\n`));
		assert.equal(violations[0].rule, "no-hardcoded-colors");
	});

	it("flags an rgba() color", () => {
		const violations = checkDesignGuardrails(okFile(`const shade = "rgba(0, 0, 0, 0.4)";\n`));
		assert.equal(violations[0].rule, "no-hardcoded-colors");
	});

	it("does not flag the design system's own semantic color props", () => {
		const violations = checkDesignGuardrails(
			okFile(`<Text variant="body-sm" color="secondary">x</Text>;\n<Tag color="green" text="Live" />;\n`),
		);
		assert.deepEqual(violations, []);
	});

	it("flags an arbitrary bracketed Tailwind value", () => {
		const violations = checkDesignGuardrails(okFile(`<Layout.Stack className="pt-[37px]">x</Layout.Stack>;\n`));
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "no-arbitrary-tailwind-values");
	});

	it("does not flag a typed array or a scale-step utility class", () => {
		const violations = checkDesignGuardrails(
			okFile(`const list = agents as Agent[];\n<Layout.Stack gap="lg" className="p-8 gap-md">x</Layout.Stack>;\n`),
		);
		assert.deepEqual(violations, []);
	});

	it("flags a physical direction utility", () => {
		const violations = checkDesignGuardrails(okFile(`<Layout.Row className="pl-4 mr-2">x</Layout.Row>;\n`));
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "no-physical-direction-utilities");
	});

	it("flags text-left and absolute left-/right- positioning", () => {
		assert.equal(
			checkDesignGuardrails(okFile(`<Text variant="body" className="text-left">x</Text>;\n`))[0].rule,
			"no-physical-direction-utilities",
		);
		assert.equal(
			checkDesignGuardrails(okFile(`<Badge className="absolute right-0 top-0" />;\n`))[0].rule,
			"no-physical-direction-utilities",
		);
	});

	it("allows the logical forms the design system actually ships", () => {
		const violations = checkDesignGuardrails(
			okFile(
				`<Layout.Row className="ps-4 pe-2 ms-auto text-start border-s-0 rounded-s-none end-2">x</Layout.Row>;\n`,
			),
		);
		assert.deepEqual(violations, []);
	});

	/** `rounded-lg` is everywhere; matching it as a physical corner utility
	 * would make this gate unusable. */
	it("does not mistake rounded-lg for a physical corner utility", () => {
		const violations = checkDesignGuardrails(okFile(`<Card className="rounded-lg p-4">x</Card>;\n`));
		assert.deepEqual(violations, []);
	});

	it("does not flag the words left or right in ordinary copy", () => {
		const violations = checkDesignGuardrails(
			okFile(`<Text variant="body">Swipe left or right to move between steps</Text>;\n`),
		);
		assert.deepEqual(violations, []);
	});

	it("flags transition-all", () => {
		const violations = checkDesignGuardrails(
			okFile(`<Button className="transition-all duration-200">Save</Button>;\n`),
		);
		assert.equal(violations.length, 1);
		assert.equal(violations[0].rule, "no-transition-all");
	});

	it("allows a transition that names its properties", () => {
		const violations = checkDesignGuardrails(
			okFile(`<Button className="transition-opacity duration-150">Save</Button>;\n`),
		);
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
