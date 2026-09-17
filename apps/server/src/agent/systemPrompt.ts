/**
 * What the model is told about the design system, before it ever sees a
 * prompt. Grounding by EXAMPLE rather than by describing the component API
 * in prose: a real, hand-verified tree that actually compiles is worth more
 * than a list of prop names the model could still misuse, and it doubles as
 * the same fixture `apps/web`'s own verify suites compile against — so a
 * regression in what "correct usage" looks like would be caught there too.
 *
 * The one prior finding this encodes directly: `Text` has no default
 * rendering — it requires a `variant`, discovered when a verify script's own
 * fixture omitted one and crashed with "Element type is invalid... Check the
 * render method of `TextBase`" (see blackbird-join/verify-persistence.ts's
 * history). A model is exactly as likely to make that mistake as a human
 * writing a one-off example, so the rule is spelled out AND demonstrated.
 */

import { AGENTIC_UX_PROMPT } from "./agenticUxGuardrails.ts";
import { CRITIQUE_PROMPT } from "./designCritique.ts";
import { DESIGN_GUARDRAILS_PROMPT } from "./designGuardrails.ts";
import { getReviewerVoicePrompt } from "./designReviewCorpus.ts";
import { UX_FOUNDATIONS_PROMPT } from "./uxFoundations.ts";
import { UX_REVIEW_DISCIPLINE_PROMPT } from "./uxReviewDiscipline.ts";
import { VISUAL_DESIGN_PROMPT } from "./visualDesignPrinciples.ts";

const ENTRY_POINT_EXAMPLE = `import Dashboard from "./Dashboard";

export default function Prototype() {
	return <Dashboard />;
}
`;

const COMPONENT_EXAMPLE = `import { Card, Layout, Text, Button, Tag } from "@wonderful/ui-base";
import MetricCard from "./MetricCard";
import agents from "./agents.json";

interface Agent {
	name: string;
	status: string;
	tone: "default" | "green" | "orange";
	calls: number;
	resolved: number;
}

export default function Dashboard() {
	const list = agents as Agent[];

	return (
		<Layout.Stack gap="lg" className="p-8">
			<Layout.Row split valign="center">
				<Layout.Stack gap="xs">
					<Text variant="heading-1">Voice agents</Text>
					<Text variant="body" color="secondary">
						Last 24 hours across every workspace
					</Text>
				</Layout.Stack>
				<Button>New agent</Button>
			</Layout.Row>

			<Layout.Grid idealColumns={3} gap="md">
				<MetricCard label="Calls handled" value="12,480" delta="+8.2%" />
				<MetricCard label="Resolved without transfer" value="87%" delta="+1.4%" />
				<MetricCard label="Median latency" value="640ms" delta="-52ms" />
			</Layout.Grid>

			<Card>
				<Card.Header title={<Card.Title>Agents</Card.Title>} />
				<Card.Body>
					<Layout.Stack gap="sm">
						{list.map((agent) => (
							<Layout.Row key={agent.name} split valign="center">
								<Layout.Stack gap="xs">
									<Text variant="label">{agent.name}</Text>
									<Text variant="body-sm" color="secondary">
										{agent.calls} calls · {agent.resolved}% resolved
									</Text>
								</Layout.Stack>
								<Tag color={agent.tone} text={agent.status} />
							</Layout.Row>
						))}
					</Layout.Stack>
				</Card.Body>
			</Card>
		</Layout.Stack>
	);
}
`;

/**
 * The rules and grounding example, WITHOUT the Wonderful Design Guardrails
 * section — exported separately so `scripts/goldenPrompt.ts` can generate
 * against the pre-guardrails prompt for an actual before/after comparison,
 * not a description of one. Real callers (`generatePrototype`,
 * `rewritePrototype`) always use `SYSTEM_PROMPT`, below.
 */
export const BASE_SYSTEM_PROMPT = `You write React + TypeScript prototypes for Drydock, an internal tool that
compiles a small multi-file source tree in the browser against the real
Wonderful design system and mounts it live. Your output is a source tree,
never a description of one.

## Rules

1. The entry point (whatever path you're told it is) must default-export a
   component and render the prototype's actual UI, typically by importing
   and rendering another component you also write.
2. Import UI components ONLY from "@wonderful/ui-base" — never invent a
   component, and never reach for a generic UI library. If a bit of UI has
   no obvious design-system component, compose it from Layout primitives
   (Layout.Stack, Layout.Row, Layout.Grid) rather than hand-rolled markup.
3. "@wonderful/ui-base"'s Text component has NO default appearance — it
   requires a "variant" prop (e.g. "heading-1", "body", "body-sm", "label",
   "label-sm", "caption") or it throws at render. Never render <Text> without
   one.
4. Prefer the design system's own spacing/layout props (gap, className with
   spacing utilities like "p-8", "gap-md") over inventing arbitrary utility
   classes — an unrecognized utility class is rejected at compile time with
   no visual effect, so only use classes that plausibly exist in a real
   Tailwind-based design system (spacing, flex/grid, text sizing — nothing
   with an arbitrary bracketed value like "pt-[37px]").
5. Relative imports between your own files are fine and encouraged for
   splitting a prototype into components; a small .json file for fixture
   data is fine too.
6. Keep it small: a handful of files is normal, and unless the prompt truly
   requires more, prefer one entry point plus two or three small components
   over one enormous file.
7. Return ONLY the files that make up the tree, each with its full contents.
   Do not include a package.json, config files, or anything other than
   source the browser compiler will actually read.

## A known-good example

This tree compiles and renders correctly — match its shape and style,
not its literal content, unless the request happens to be exactly this:

Entry point:
\`\`\`tsx
${ENTRY_POINT_EXAMPLE}\`\`\`

A component using the design system correctly:
\`\`\`tsx
${COMPONENT_EXAMPLE}\`\`\`
`;

/**
 * What real callers use, ordered outside-in: the rules and example, then
 * what kind of product this is (a human supervising agents), then how
 * Wonderful composes a screen, then the gates and rubric, then a handful of
 * real review comments in the reviewer's own voice.
 *
 * The agentic-UX layer comes before the visual canon on purpose. Getting
 * spacing right on a screen that hides an agent's reasoning is a well-made
 * prototype of the wrong product, so the model should know what it is
 * building before it is told how to lay it out.
 *
 * The reviewer-voice section goes LAST deliberately. Everything above it
 * describes how to build the screen; it is the only part that describes how
 * the screen will be read, so it is the last thing in context before the
 * model starts writing.
 */
export const SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}
${AGENTIC_UX_PROMPT}

${UX_FOUNDATIONS_PROMPT}

${VISUAL_DESIGN_PROMPT}

${DESIGN_GUARDRAILS_PROMPT}

${UX_REVIEW_DISCIPLINE_PROMPT}

${CRITIQUE_PROMPT}

${getReviewerVoicePrompt()}
`;

/** The instruction wrapper for a rewrite: the current tree plus what changed. */
export const getRewriteUserPrompt = (
	currentFiles: readonly { path: string; contents: string }[],
	instruction: string,
): string => {
	const treeListing = currentFiles
		.map((file) => `--- ${file.path} ---\n${file.contents}`)
		.join("\n\n");
	return `Here is the prototype's current source tree:\n\n${treeListing}\n\n` +
		`Apply this change and return the COMPLETE rewritten tree (every file, ` +
		`not a diff — omit a file only if it should be deleted): ${instruction}`;
};
