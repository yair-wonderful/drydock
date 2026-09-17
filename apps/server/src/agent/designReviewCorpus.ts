/**
 * What a Wonderful design reviewer actually rejects.
 *
 * Source: a design review file holding four paired
 * columns — a reference frame the design team considers good on top, the
 * same screen as it ships in production below — annotated with 31 comment
 * review pins, carrying 34 individual remarks (a few pins hold more than
 * one; the segmented control alone drew three). Each remark is stored
 * separately because they land in different clusters.
 *
 * Transcribed verbatim here, because the pins are the only
 * labelled record this project has of the judgment the guardrails are
 * trying to encode, and a design comment thread is not a dependency an
 * agent loop can read at generation time.
 *
 * TWO FINDINGS THIS CORPUS FORCED, both of which changed the design of the
 * guardrail system rather than just adding to it:
 *
 * 1. NONE of the nine mechanical hard gates in `designGuardrails.ts` would
 *    have caught ANY of these. Production code already imports the right
 *    components, uses tokens, and has no inline styles — it passes every
 *    gate. Every defect here is composition and calibration. The gate layer
 *    is at its useful limit; the leverage is in the prompt and the rubric.
 *    See `getMechanicallyCheckableCount` — the corpus proves this in data
 *    rather than asserting it in prose.
 *
 * 2. Four of the pins are on the REFERENCE frame, not production. The
 *    "good" example gets picked apart too, so there is no clean exemplar to
 *    encode. A guardrail system built by imitating Wonderful's best screens
 *    would inherit their defects along with their virtues.
 *
 * Findings marked `unsettled` are open questions in the reviewer's own
 * voice ("Toggle should be on the left?"), not decided rules. They are kept
 * because the frequency of a question is itself signal, but nothing derived
 * from this corpus may turn one into an assertion — encoding an argument
 * that hasn't finished is how a tool starts losing arguments for people.
 */

export type DesignDefectCluster =
	| "contrast-weight"
	| "spacing"
	| "geometry"
	| "component-provenance"
	| "affordance"
	| "container-nesting"
	| "state-legibility"
	| "unsettled";

export type DesignReviewFinding = {
	/** Stable id, so a later pass can reference one finding without quoting it. */
	id: string;
	/** The review frame the pin sits on. */
	frame: string;
	/** True when pinned on a reference ("good") frame rather than production. */
	isReference: boolean;
	/** The element the pin is attached to. */
	surface: string;
	/** The comment, verbatim — typos included, because paraphrasing a
	 * one-line design note is how its edge gets sanded off. */
	quote: string;
	cluster: DesignDefectCluster;
	/**
	 * Could a text-level check over the source have caught this, reliably,
	 * without an AST and without false positives on correct screens? Almost
	 * always false — that is the point of recording it.
	 */
	mechanicallyCheckable: boolean;
};

export const DESIGN_REVIEW_CORPUS: readonly DesignReviewFinding[] = [
	// --- Branch protection modal, reference frame -------------------------
	{
		id: "bp-toggle-side",
		frame: "Variants page / Branch protection modal",
		isReference: true,
		surface: "Branch protection toggle",
		quote: "Toggle should be on the left?",
		cluster: "unsettled",
		mechanicallyCheckable: false,
	},
	{
		id: "bp-box-in-box",
		frame: "Variants page / Branch protection modal",
		isReference: true,
		surface: "Grey settings panel inside the modal body",
		quote: "why box in box?",
		cluster: "container-nesting",
		mechanicallyCheckable: false,
	},
	{
		id: "bp-stepper-exists",
		frame: "Variants page / Branch protection modal",
		isReference: true,
		surface: "Minus/plus stepper on the approval-count input",
		quote: "Is this a thing?",
		cluster: "component-provenance",
		mechanicallyCheckable: false,
	},
	{
		id: "bp-floppy-icon",
		frame: "Variants page / Branch protection modal",
		isReference: true,
		surface: "Save button icon",
		quote: "Floppy icon :/",
		cluster: "component-provenance",
		mechanicallyCheckable: false,
	},

	// --- Shared library ---------------------------------------------------
	{
		id: "sl-nav-selection",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Sidebar nav (Shared library / Branches / Pull request)",
		quote: "Which one is selected",
		cluster: "state-legibility",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-icon-vs-text",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Sidebar item icons against their labels",
		quote: "Icons look darker than text. is this intentional",
		cluster: "contrast-weight",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-readonly-unreadable",
		frame: "shared lib/tools",
		isReference: false,
		surface: '"Read only" pill on a tool card',
		quote: "Not readable",
		cluster: "contrast-weight",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-readonly-too-big",
		frame: "shared lib/tools",
		isReference: false,
		surface: '"Read only" pill on a tool card',
		quote: "text seem too big here",
		cluster: "geometry",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-icon-tile-metrics",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Wrench icon tile in the tool card corner",
		quote: "Space and size seem off",
		cluster: "spacing",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-filter-spacing",
		frame: "shared lib/tools",
		isReference: false,
		surface: '"Last added" filter control',
		quote: "Spacing here is off",
		cluster: "spacing",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-tab-spacing",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Tools / Utilities / Diacritics / Knowledge base tab row",
		quote: "Spacing between tabs",
		cluster: "spacing",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-subtitle-to-tabs",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Gap between the page subtitle and the tab row",
		quote: "not enough space",
		cluster: "spacing",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-topbar-color",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Topbar branch / shield / traffic-status cluster",
		quote: "Too colorfull",
		cluster: "contrast-weight",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-draft-pill-odd",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Draft pill beside the Test and Publish buttons",
		quote: "Weird here",
		cluster: "container-nesting",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-publish-deprecated",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Solid black Publish button",
		quote: "deprecated style",
		cluster: "component-provenance",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-draft-too-light",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Draft pill",
		quote: "too light",
		cluster: "contrast-weight",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-search-placeholder",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Search Tools field placeholder",
		quote: "Place holder color too light",
		cluster: "contrast-weight",
		mechanicallyCheckable: false,
	},
	{
		id: "sl-search-icon",
		frame: "shared lib/tools",
		isReference: false,
		surface: "Search icon, in the very same field whose placeholder was called too light",
		quote: "Too dark",
		cluster: "contrast-weight",
		mechanicallyCheckable: false,
	},

	// --- Create-agent modal ----------------------------------------------
	{
		id: "ca-name-placeholder",
		frame: "Agents/02/wizard/agents preview",
		isReference: false,
		surface: "Agent name field placeholder",
		quote: "Placeholder too light",
		cluster: "contrast-weight",
		mechanicallyCheckable: false,
	},
	{
		id: "ca-required-marker",
		frame: "Agents/02/wizard/agents preview",
		isReference: false,
		surface: "Red asterisk before the Agent name label",
		quote: "Do we like the mandatory on the left?",
		cluster: "unsettled",
		mechanicallyCheckable: false,
	},
	{
		id: "ca-swatch-ratio",
		frame: "Agents/02/wizard/agents preview",
		isReference: false,
		surface: "Colour swatch tiles",
		quote: "button ratio feels off",
		cluster: "geometry",
		mechanicallyCheckable: false,
	},
	{
		id: "ca-sphere-size",
		frame: "Agents/02/wizard/agents preview",
		isReference: false,
		surface: "Agent sphere inside a swatch tile",
		quote: "Sphere size seems too amall",
		cluster: "geometry",
		mechanicallyCheckable: false,
	},
	{
		id: "ca-hero-air",
		frame: "Agents/02/wizard/agents preview",
		isReference: false,
		surface: "Hero / avatar area at the top of the modal",
		quote: "Too much air?",
		cluster: "spacing",
		mechanicallyCheckable: false,
	},

	// --- Agents hub -------------------------------------------------------
	{
		id: "ah-badge-looks-clickable",
		frame: "Agents/Full",
		isReference: false,
		surface: "Chat-bubble indicator in the agent card corner",
		quote: "Looks like a button",
		cluster: "affordance",
		mechanicallyCheckable: false,
	},
	{
		id: "ah-card-subtitle",
		frame: "Agents/Full",
		isReference: false,
		surface: 'Agent card subtitle ("Partner TV Plus assistant")',
		quote: "Text too light",
		cluster: "contrast-weight",
		mechanicallyCheckable: false,
	},
	{
		id: "ah-new-agent-primary",
		frame: "Agents/Full",
		isReference: false,
		surface: '"+ New agent" button, rendered as a plain outlined button',
		quote: "Primary?",
		cluster: "affordance",
		mechanicallyCheckable: false,
	},
	{
		id: "ah-view-toggle",
		frame: "Agents/Full",
		isReference: false,
		surface: "Block | List view toggle with text labels",
		quote: "Should be icon only",
		cluster: "affordance",
		mechanicallyCheckable: false,
	},

	// --- Build locally modal ---------------------------------------------
	{
		id: "bl-segmented-height",
		frame: "Modal / Build locally",
		isReference: false,
		surface: "CLI / Git / Export segmented control",
		quote: "Feels to narrow (height)",
		cluster: "geometry",
		mechanicallyCheckable: false,
	},
	{
		id: "bl-segmented-radius",
		frame: "Modal / Build locally",
		isReference: false,
		surface: "CLI / Git / Export segmented control",
		quote: "Corner radius not accurate",
		cluster: "geometry",
		mechanicallyCheckable: false,
	},
	{
		id: "bl-segmented-shadow",
		frame: "Modal / Build locally",
		isReference: false,
		surface: "CLI / Git / Export segmented control",
		quote: "Do we like the shadow?",
		cluster: "unsettled",
		mechanicallyCheckable: false,
	},
	{
		id: "bl-label-input-gap",
		frame: "Modal / Build locally",
		isReference: false,
		surface: "Label / Input field row",
		quote: "maybe not enough space",
		cluster: "spacing",
		mechanicallyCheckable: false,
	},
	{
		id: "bl-full-width-in-panel",
		frame: "Modal / Build locally",
		isReference: false,
		surface: "Full-width Bookmarks button inside a grey panel",
		quote: "The full width button inside the gray box is weird",
		cluster: "container-nesting",
		mechanicallyCheckable: false,
	},
	{
		id: "bl-divider-component",
		frame: "Modal / Build locally",
		isReference: false,
		surface: '"Or" divider between two options',
		quote: "Not sure about this. Also should this be a component?",
		cluster: "component-provenance",
		mechanicallyCheckable: false,
	},
	{
		id: "bl-terminal-block",
		frame: "Modal / Build locally",
		isReference: false,
		surface: "Terminal / copyable code block",
		quote: "Do we have a component for that?",
		cluster: "component-provenance",
		mechanicallyCheckable: false,
	},
];

/** How often each cluster appears — the ranking that decides what the rubric
 * asks about and what the prompt spends its words on. */
export const getClusterCounts = (): Record<DesignDefectCluster, number> => {
	const counts = {} as Record<DesignDefectCluster, number>;
	for (const finding of DESIGN_REVIEW_CORPUS) {
		counts[finding.cluster] = (counts[finding.cluster] ?? 0) + 1;
	}
	return counts;
};

/** The count behind finding 1 in the module doc: if this is ever meaningfully
 * above zero, the gate layer has new work worth doing. */
export const getMechanicallyCheckableCount = (): number =>
	DESIGN_REVIEW_CORPUS.filter((finding) => finding.mechanicallyCheckable).length;

/** The count behind finding 2: pins on the "good" reference frame. */
export const getReferenceFrameFindingCount = (): number =>
	DESIGN_REVIEW_CORPUS.filter((finding) => finding.isReference).length;

/**
 * A handful of real pins, in the reviewer's own voice, for the system
 * prompt. Grounding by example rather than by describing the failure in
 * prose — the same bet `systemPrompt.ts` makes with `COMPONENT_EXAMPLE`,
 * and for the same reason: a model is better at recognising a shape it has
 * seen than at applying a rule it has been told.
 *
 * Deliberately excludes `unsettled` findings — those are open questions,
 * and a prompt that repeats a question as if it were a rule turns it into
 * one.
 */
export const getPromptExamples = (): readonly DesignReviewFinding[] =>
	DESIGN_REVIEW_CORPUS.filter(
		(finding) =>
			finding.cluster !== "unsettled" &&
			[
				"sl-icon-vs-text",
				"sl-readonly-unreadable",
				// Kept adjacent on purpose: one field, one comment saying too
				// light and the next saying too dark. The clearest statement in
				// the corpus that this is about agreement between siblings, not
				// about going darker.
				"sl-search-placeholder",
				"sl-search-icon",
				"sl-subtitle-to-tabs",
				"ca-hero-air",
				"ah-badge-looks-clickable",
				"ah-new-agent-primary",
				"bp-box-in-box",
				"bl-full-width-in-panel",
				"bl-terminal-block",
			].includes(finding.id),
	);

/** The prompt fragment built from `getPromptExamples`. */
export const getReviewerVoicePrompt = (): string => {
	const lines = getPromptExamples()
		.map((finding) => `- ${finding.surface} — "${finding.quote}"`)
		.join("\n");
	return `## How a Wonderful reviewer reads a screen

These are real comments a Wonderful designer left on real Wonderful
screens — including screens the design team considers good. This is the
bar, and note what it is NOT about: every one of these screens already
used the right components and the right tokens. Compiling is not the
finish line.

${lines}

Read your own output the way that reviewer would before you return it.`;
};
