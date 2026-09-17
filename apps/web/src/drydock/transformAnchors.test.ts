import assert from "node:assert/strict";
import { describe, it } from "node:test";
import transformAnchors from "./transformAnchors.ts";

describe("transformAnchors", () => {
	it("adds source anchors without the heavyweight standalone Babel bundle", () => {
		const result = transformAnchors({
			"src/Dashboard.tsx": `
export function Dashboard() {
	const items = ["Alpha", "Beta"];
	return (
		<section>
			<h1>Queue</h1>
			{items.map((item) => <button key={item}>{item}</button>)}
		</section>
	);
}
`,
		});

		const output = result.tree["src/Dashboard.tsx"];
		assert.match(output, /globalThis\.__WF_ANCHORS__\?\.\[/);

		const anchors = Object.values(result.sourceMap);
		assert.ok(
			anchors.some((anchor) =>
				anchor.name === "section" && anchor.component === "Dashboard" && anchor.file === "src/Dashboard.tsx",
			),
		);
		assert.ok(
			anchors.some((anchor) =>
				anchor.name === "button" && anchor.loop === true && anchor.iterable === "items" && !anchor.component,
			),
		);
	});

	it("leaves fragments out of the anchor map", () => {
		const result = transformAnchors({
			"src/App.tsx": `export const App = () => <><span>Visible</span></>;`,
		});

		const names = Object.values(result.sourceMap).map((anchor) => anchor.name);
		assert.deepEqual(names, ["span"]);
	});
});
