/**
 * UX review discipline distilled from uploaded review skills.
 *
 * The source material was useful as a way of thinking, not as content to copy:
 * it included source-process instructions and non-Wonderful product context
 * that do not belong in Drydock. This module keeps only the
 * reusable review moves that help a generated Wonderful prototype read like a
 * production conversation between a human and agentic software.
 *
 * This is a rubric/prompt layer, not a gate layer. None of these checks are
 * reliable enough to block generation without a real artifact-level reviewer.
 */

export type UxReviewDisciplineArea = {
	id: string;
	name: string;
	checks: readonly string[];
};

export const UX_REVIEW_DISCIPLINE: readonly UxReviewDisciplineArea[] = [
	{
		id: "flow-state-machine",
		name: "Flow structure and state completeness",
		checks: [
			"Treat every prototype as a small state machine, not as isolated screens.",
			"Account for default, empty, loading, error, success, disabled, read-only, and needs-attention states when the surface implies them.",
			"A secondary flow is first-class: browse, select, configure, import, schedule, and preview flows need their own entry, completion, empty, and recovery paths.",
			"Do not claim a state is missing if the prompt explicitly scoped it out; list it as a known gap or decision question instead.",
		],
	},
	{
		id: "wayfinding",
		name: "Navigation and orientation",
		checks: [
			"A viewer can answer: where am I, where can I go, what is nearby, what will this action open, and how do I get out?",
			"Navigation labels, step labels, action labels, and destination titles use the same language for the same concept.",
			"Overlays and multi-step flows always expose Cancel, Back, Close, or a safe completion state.",
			"Avoid vague catch-all group labels such as General, Other, Advanced, More, or Misc unless the prompt explicitly asks for a settings taxonomy placeholder.",
		],
	},
	{
		id: "interaction-risk",
		name: "Interaction logic and risk calibration",
		checks: [
			"Progressive disclosure hides optional complexity, never information needed to make a confident decision.",
			"Validation is specific, placed next to the field, and explains the fix; do not make users submit before discovering ordinary form errors.",
			"Friction follows reversibility: reversible changes use lightweight feedback and undo; irreversible or cascading actions need preview and deliberate confirmation.",
			"Confirmation copy names the real effect, not a generic question. If a button says Save, it should not secretly publish, notify, or activate.",
		],
	},
	{
		id: "system-visibility",
		name: "System visibility and post-action trace",
		checks: [
			"Show what happens after a state-changing action: what changed, how many items are affected, and what the user should expect next.",
			"If an agent, automation, policy, schedule, or integration influences a value, show the source near the value.",
			"Live, draft, queued, failed, and completed states must look and read differently.",
			"A loading skeleton, error banner, or status update should not cause persistent controls to jump unexpectedly.",
		],
	},
	{
		id: "permissions-resilience",
		name: "Permissions, resilience, and recovery",
		checks: [
			"Permission-aware surfaces explain what is locked, inherited, or unavailable and why.",
			"Sensitive items are not previewed to people who cannot access them; do not leak restricted content through disabled rows, search results, or previews.",
			"Errors always include a next action: retry, fix in place, return to safety, dismiss, or contact support.",
			"Customization and configuration surfaces need defaults, bounds, and a restore or reset path when users can make the surface worse for themselves.",
		],
	},
	{
		id: "wonderful-domain-fit",
		name: "Wonderful domain fit",
		checks: [
			"Use only the Wonderful vocabulary present in the prompt and prototype; do not add unstated domain assumptions.",
			"Keep entity hierarchy honest: an agent, task, issue, interaction, dashboard metric, procedure, monitor, or workspace setting should not be shown as a sibling or child of the wrong thing.",
			"When a screen crosses product areas, show the handoff explicitly: source, destination, responsible party, state, and failure path.",
			"If the prompt does not provide enough domain truth to make a claim, ask a decision question instead of inventing a rule.",
		],
	},
	{
		id: "review-output-quality",
		name: "Review output quality",
		checks: [
			"Surface a small number of useful findings, not a checklist matrix. Collapse issues with the same root cause.",
			"Praise concrete architectural choices that work before naming what fails; generic praise is noise.",
			"Open questions are decision gates: architecture, implementation, governance, accountability, defaults, or cross-team impact. Do not ask generic research questions.",
			"If the prototype is strong, use opportunities to make it sharper instead of inflating minor observations into warnings.",
		],
	},
];

const getAreaLines = (): string =>
	UX_REVIEW_DISCIPLINE.map((area) => {
		const checks = area.checks.map((check) => `- ${check}`).join("\n");
		return `**${area.name}**\n${checks}`;
	}).join("\n\n");

export const UX_REVIEW_DISCIPLINE_PROMPT = `## UX review discipline

Use these review moves while designing and while filling out the self-review.
They are not hard gates. They are the questions a Wonderful reviewer should
not have to ask from scratch.

${getAreaLines()}`;
