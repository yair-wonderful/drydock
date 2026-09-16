/**
 * The critique instrument: five internal `critique-*` skills
 * (visual-hierarchy, typography, composition, affordance,
 * information-density) reduced to one structured artifact the model fills
 * in against its own output.
 *
 * WHY THIS EXISTS. `docs/wonderful-design-guardrails.md` has said since the
 * review corpus landed that the corpus "is not yet a scored benchmark —
 * nothing yet runs a generated screen against it and produces a number."
 * The five critique skills are that missing instrument, and they arrive
 * already sharing one contract: four dimensions each, every finding stated
 * as Observation → Problem → Fix, rated pass / minor issue / major issue.
 * Twenty dimensions, one shape. That uniformity is what makes them
 * encodable as a type rather than as prose.
 *
 * FINDINGS ONLY, NOT A MATRIX. The skills rate all four dimensions every
 * time; this artifact asks only for dimensions where something is actually
 * wrong. A model made to emit twenty rows will pad nineteen of them, and a
 * reviewer reading twenty "pass" rows learns nothing. Absence of a
 * dimension here means "nothing found", which is the same information at a
 * fraction of the noise — and the rated axes in `DesignReviewRubric`
 * already carry the at-a-glance summary.
 *
 * HOW THIS RELATES TO THE CORPUS. The 20 dimensions cover the corpus
 * clusters well, with two honest gaps worth naming:
 *
 * 1. `component-provenance` (5 corpus remarks — "Is this a thing?", "Do we
 *    have a component for that?") has no critique dimension at all. That is
 *    fine: it is the one cluster Drydock answers mechanically at compile
 *    time, so it needs a rubric axis, not a critique prompt.
 * 2. `critique-typography` covers contrast as WCAG compliance (4.5:1 body,
 *    3:1 large). The corpus's contrast complaints are NOT WCAG failures —
 *    "Placeholder too light", "Too dark", "Icons look darker than text" are
 *    about the 3-step ladder and about siblings inside one control
 *    disagreeing. A placeholder can pass AA and still be wrong here. So
 *    `contrast-ladder` below is sourced from the corpus, not from the
 *    skills, and is the one dimension in this file the five skills did not
 *    supply.
 */

import type { CritiqueDimension, CritiqueLens } from "@drydock/prototype";

export const CRITIQUE_DIMENSIONS_BY_LENS: Readonly<Record<CritiqueLens, readonly CritiqueDimension[]>> = {
	"visual-hierarchy": ["entry-point", "eye-flow", "weight", "emphasis"],
	typography: ["scale-usage", "readability", "type-consistency", "token-compliance", "contrast-ladder"],
	composition: ["balance", "whitespace", "rhythm", "gestalt"],
	affordance: ["clickability", "state-visibility", "cta-clarity", "discoverability"],
	"information-density": ["cognitive-load", "content-priority", "scanning-pattern", "progressive-disclosure"],
};

export const ALL_CRITIQUE_DIMENSIONS: readonly CritiqueDimension[] = Object.values(
	CRITIQUE_DIMENSIONS_BY_LENS,
).flat();

/** What each dimension asks, in one line — the prompt's whole vocabulary. */
const DIMENSION_QUESTIONS: Readonly<Record<CritiqueDimension, string>> = {
	"entry-point": "the first thing the eye lands on is the most important thing on screen",
	"eye-flow": "the path after landing is deliberate, with no dead ends or confusing jumps",
	weight: "visual weight is distributed on purpose; heavy type stays rare enough to mean something",
	emphasis: "exactly one emphasis zone, and it matches what the user came to do",
	"scale-usage": "only defined type-scale steps, each used for its intended job",
	readability: "body sizes, line-height and line length are comfortable for the content type",
	"type-consistency": "semantically equal things (all card titles, all labels) share one type style",
	"token-compliance": "type and colour come from tokens, never raw values",
	"contrast-ladder": "every text and icon sits on the 3-step ladder, and siblings inside ONE control agree",
	balance: "visual weight is distributed across the canvas; the layout does not tip",
	whitespace: "space separates groups and binds members; nothing is over-compressed or stranded",
	rhythm: "spacing intervals come off one scale; repeated elements keep uniform size and gap",
	gestalt: "proximity, similarity and alignment do the grouping work instead of borders",
	clickability: "interactive things look interactive; nothing static looks clickable",
	"state-visibility": "default / hover / focus / disabled / selected are visually distinct",
	"cta-clarity": "one dominant action, filled, with a specific action-oriented label",
	discoverability: "actions can be found without hovering; empty states say what to do next",
	"cognitive-load": "the screen serves one goal; nothing competes that does not serve the task",
	"content-priority": "the most important content is the most visible; support is subordinate",
	"scanning-pattern": "labels align for vertical scanning; numbers and dates are formatted consistently",
	"progressive-disclosure": "secondary detail is deferred; nothing primary is hidden behind a disclosure",
};

const getDimensionLines = (): string =>
	Object.entries(CRITIQUE_DIMENSIONS_BY_LENS)
		.map(([lens, dimensions]) => {
			const items = dimensions.map((d) => `  - \`${d}\` — ${DIMENSION_QUESTIONS[d]}`).join("\n");
			return `**${lens}**\n${items}`;
		})
		.join("\n\n");

export const CRITIQUE_PROMPT = `## Critique your own screen before you hand it over

After the tree is written, review it the way a Wonderful designer would and
report what you find in \`review.critique\`. Report ONLY dimensions where
something is actually wrong — a dimension you leave out means you checked it
and it passed. Padding this list with non-findings makes it useless.

For each finding give four things:
- \`dimension\`: one of the names below.
- \`observation\`: what is there, neutral and factual — no judgement yet.
- \`problem\`: what is broken about it and why that matters to someone using
  this screen.
- \`fix\`: the specific change. "Make the New agent button filled rather
  than outlined, since it is the page's primary action" — not "improve the
  button hierarchy".
- \`severity\`: \`major\` if it would stop a reviewer approving the screen,
  \`minor\` if it is a nit they would mention but not block on.

The dimensions:

${getDimensionLines()}

Two honest notes on using this. Finding nothing is a legitimate result, but
finding nothing on a screen you just built from scratch is unlikely — the
useful move is to name the two or three things you are least sure about.
And a finding against yourself costs you nothing here: this artifact is
shown to a reviewer to direct their attention, never graded against you.`;
