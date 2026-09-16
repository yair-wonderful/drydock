import { getPath, getText } from "./captureAnchor";
import getSimilarity from "./getSimilarity";
import type { AnchorResolution, AnchorSignals } from "./types";

/**
 * Re-resolves an anchor against a rewritten page.
 *
 * The design rule, and the whole reason this module exists: **never silently
 * move a comment to a plausible replacement.** A confident match is
 * `attached`; a match the evidence argues with is `needsReview`; no match, or
 * a tie between candidates, is `orphaned` or `needsReview` — never a quiet
 * re-aim. A reviewer can act on "this may no longer be about what you think";
 * nobody can act on a pin that moved without saying so.
 *
 * Signals are weighted by how much a rewrite can disturb them:
 *
 *   source anchor   strongest — a hash of file:line:col, immune to layout,
 *                   text and ordering; only a source edit moves it
 *   id / testId     authored identity; stable unless deliberately changed
 *   list key        survives reordering, which is the common rewrite
 *   ds component    narrows the field; rarely unique on its own
 *   text            good evidence, but the thing a rewrite most often edits
 *   path            a layout accident; a tiebreak, never a reason
 *
 * A signal that was NOT unique at capture time scores a fraction of its
 * weight: evidence that could not identify the element then cannot identify it
 * now, and pretending otherwise is exactly how a comment gets re-aimed.
 */

const WEIGHTS = {
	source: 100,
	domId: 60,
	testId: 60,
	listKey: 40,
	dsComponent: 20,
	text: 30,
	ariaLabel: 25,
	sourceName: 10,
	path: 8,
} as const;

/**
 * Two thresholds, because ASSERTING a match and ASKING a human about one are
 * not the same claim and should not need the same confidence.
 *
 * `attached` says "this is the element your comment is about" — it needs to be
 * right, so it is expensive. `needsReview` says "this is probably it, and
 * something about it changed" — being wrong there costs a glance, so it is
 * cheap. Collapsing them into one bar was the bug: a renamed row whose text was
 * UNIQUE before and is the only near-match now is obviously worth showing
 * someone, but it scored 37 against a bar of 60 and was declared lost.
 *
 * Below the review bar there is genuinely nothing to show, and the answer is
 * `orphaned`.
 */
const ATTACH_THRESHOLD = 60;
const REVIEW_THRESHOLD = 30;
/** A best candidate this close to the runner-up is a coin flip, so we refuse to call it. */
const AMBIGUITY_MARGIN = 15;
/** Non-unique signals are worth this fraction of their weight. */
const NON_UNIQUE_FACTOR = 0.25;
/**
 * How alike two texts must be to count as "the same thing, edited" rather than
 * "a different thing". Tuned to separate the two cases that actually occur:
 * a rename keeps most of its characters ("Outbound sales" → "Outbound sales
 * (EMEA)"), while two different list rows sharing a template ("… calls · …%
 * resolved") do not clear it.
 */
const NEAR_MATCH = 0.7;
/** A near match earns this share of what an exact match would. */
const NEAR_MATCH_FACTOR = 0.8;

interface Candidate {
	element: Element;
	score: number;
	matched: string[];
	changed: string[];
}

function scoreSignal(
	weight: number,
	unique: boolean,
	agrees: boolean,
	name: string,
	candidate: Candidate,
): void {
	if (agrees) {
		candidate.score += unique ? weight : weight * NON_UNIQUE_FACTOR;
		candidate.matched.push(unique ? name : `${name} (was ambiguous)`);
	} else {
		candidate.changed.push(name);
	}
}

/**
 * Scores a TEXTUAL signal, where "close" is meaningful. An exact hit scores
 * normally; a near hit scores partially and is reported as changed, so the
 * resolution lands on `needsReview` rather than quietly claiming a match.
 */
function scoreTextSignal(
	weight: number,
	unique: boolean,
	captured: string,
	current: string,
	name: string,
	candidate: Candidate,
): void {
	if (captured === current) {
		scoreSignal(weight, unique, true, name, candidate);
		return;
	}
	const similarity = getSimilarity(captured, current);
	if (similarity >= NEAR_MATCH) {
		const base = unique ? weight : weight * NON_UNIQUE_FACTOR;
		candidate.score += base * similarity * NEAR_MATCH_FACTOR;
		candidate.changed.push(`${name} (edited)`);
		return;
	}
	candidate.changed.push(name);
}

function scoreElement(element: Element, signals: AnchorSignals): Candidate {
	const candidate: Candidate = { element, score: 0, matched: [], changed: [] };

	if (signals.source) {
		scoreSignal(
			WEIGHTS.source,
			signals.source.unique,
			element.getAttribute("data-source-id") === signals.source.value,
			"source anchor",
			candidate,
		);
	}
	if (signals.domId) {
		scoreSignal(WEIGHTS.domId, signals.domId.unique, element.id === signals.domId.value, "id", candidate);
	}
	if (signals.testId) {
		scoreSignal(
			WEIGHTS.testId,
			signals.testId.unique,
			element.getAttribute("data-testid") === signals.testId.value,
			"test id",
			candidate,
		);
	}
	if (signals.listKey) {
		scoreTextSignal(
			WEIGHTS.listKey,
			signals.listKey.unique,
			signals.listKey.value,
			getText(element).slice(0, 40),
			"list key",
			candidate,
		);
	}
	if (signals.dsComponent) {
		scoreSignal(
			WEIGHTS.dsComponent,
			signals.dsComponent.unique,
			element.getAttribute("data-ds-component") === signals.dsComponent.value,
			"design-system component",
			candidate,
		);
	}
	if (signals.text) {
		scoreTextSignal(
			WEIGHTS.text,
			signals.text.unique,
			signals.text.value,
			getText(element),
			"text",
			candidate,
		);
	}
	if (signals.ariaLabel) {
		scoreSignal(
			WEIGHTS.ariaLabel,
			signals.ariaLabel.unique,
			element.getAttribute("aria-label") === signals.ariaLabel.value,
			"aria-label",
			candidate,
		);
	}
	if (signals.sourceName) {
		scoreSignal(
			WEIGHTS.sourceName,
			true,
			element.getAttribute("data-source-name") === signals.sourceName,
			"element name",
			candidate,
		);
	}
	// Path is a tiebreak only: it earns a little for agreeing and is never
	// counted against a candidate, because a rewrite is SUPPOSED to change it.
	if (getPath(element) === signals.path) {
		candidate.score += WEIGHTS.path;
		candidate.matched.push("structural path");
	}

	return candidate;
}

function getOrphanReason(signals: AnchorSignals): string {
	if (signals.source?.unique) {
		return "The element this was pinned to no longer exists in the source — nothing carries its anchor.";
	}
	return "Nothing in the rewritten page matches this comment's element closely enough to claim it.";
}

export default function resolveAnchor(
	signals: AnchorSignals,
	root: ParentNode,
): AnchorResolution {
	const candidates = [...root.querySelectorAll("*")]
		.map((element) => scoreElement(element, signals))
		.filter((candidate) => candidate.score > 0)
		.sort((a, b) => b.score - a.score);

	const best = candidates[0];
	if (!best || best.score < REVIEW_THRESHOLD) {
		return {
			status: "orphaned",
			element: null,
			score: best?.score ?? 0,
			matched: best?.matched ?? [],
			changed: best?.changed ?? [],
			reason: getOrphanReason(signals),
		};
	}

	// Two candidates within the margin is a coin flip. Refuse to call it: this
	// is precisely the case where a positional anchor would silently pick one.
	const runnerUp = candidates[1];
	if (runnerUp && best.score - runnerUp.score < AMBIGUITY_MARGIN) {
		return {
			status: "needsReview",
			element: null,
			score: best.score,
			matched: best.matched,
			changed: best.changed,
			reason: `Two elements match this comment about equally well (${best.score} vs ${runnerUp.score}); picking one would be a guess.`,
		};
	}

	// A decisive identity signal (the source anchor, an id) carries the match
	// even when the element moved — movement is not disagreement.
	const hasStrongIdentity = best.matched.some(
		(name) => name.startsWith("source anchor") || name === "id" || name === "test id",
	);

	// Evidence that CHANGED is what a reviewer needs to see. Text edits are the
	// common case: the element is still there, but it may no longer be the thing
	// the comment was about.
	const meaningfulChange = best.changed.filter((name) => name !== "structural path");

	if (meaningfulChange.length > 0) {
		return {
			status: "needsReview",
			element: best.element,
			score: best.score,
			matched: best.matched,
			changed: meaningfulChange,
			reason: `Found the element, but its ${meaningfulChange.join(" and ")} changed since the comment was written.`,
		};
	}

	// Nothing contradicts the anchor, but the evidence is thin — enough to point
	// at, not enough to vouch for.
	if (best.score < ATTACH_THRESHOLD) {
		return {
			status: "needsReview",
			element: best.element,
			score: best.score,
			matched: best.matched,
			changed: [],
			reason: "The closest match is plausible but weakly evidenced; worth confirming.",
		};
	}

	return {
		status: "attached",
		element: best.element,
		score: best.score,
		matched: best.matched,
		changed: [],
		reason: hasStrongIdentity
			? "Matched on a stable identity signal; the element may have moved, but it is the same element."
			: "Every captured signal still agrees.",
	};
}
