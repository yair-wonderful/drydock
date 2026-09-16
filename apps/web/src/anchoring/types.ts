/**
 * Comment anchoring that survives a rewrite.
 *
 * The problem this exists for: a canvas that pins comments by position
 * (`{x, y}` normalised to the frame) is accurate only until the page changes.
 * Move a card, insert a row, and the pin still sits at 43% × 67% — now
 * pointing at whatever happens to be there. The comment has not been lost
 * loudly; it has been re-aimed silently, which is worse, because the thread
 * still reads as if it were about the thing under the pin.
 *
 * So an anchor stores IDENTITY, not position, and re-resolution is allowed to
 * fail. The three outcomes are deliberate, and `needsReview` is the important
 * one: it is the honest answer whenever the evidence disagrees with itself.
 */

/** One captured signal, and whether it identified the element UNIQUELY at capture time. */
export interface Signal<T> {
	value: T;
	/** A signal that was ambiguous when captured is weak evidence later. */
	unique: boolean;
}

export interface AnchorSignals {
	/**
	 * The Drydock source anchor: an opaque hash of file:line:col, stamped on
	 * every JSX element. The strongest signal available — it is immune to
	 * layout, text and ordering changes, and changes only when the element's
	 * source location does.
	 */
	source?: Signal<string>;
	sourceFile?: string;
	sourceLine?: number;
	/** The element's own name — a host tag (`div`) or a component (`Card`). */
	sourceName?: string;

	/** The design system's own identity for the element, per Blackbird's DS tagging. */
	dsComponent?: Signal<string>;
	dsVariant?: string;

	domId?: Signal<string>;
	testId?: Signal<string>;

	/** Trimmed, collapsed text content — evidence, not identity. */
	text?: Signal<string>;
	ariaLabel?: Signal<string>;
	role?: string;

	/** Structural path from the root, as `tag:nth-of-type` steps. A layout accident by design. */
	path: string;

	/**
	 * Which item of a repeated group this was. `key` is the item's own stable
	 * text; `index` is where it sat. When a list reorders, `key` still matches
	 * and `index` does not — which is exactly how we tell a move from a swap.
	 */
	listKey?: Signal<string>;
	listIndex?: number;

	/**
	 * Selectors of collapsed ancestors (a closed `<details>`, a hidden dialog)
	 * that must be opened before the element is visible. Harbor calls this the
	 * "reveal" context; without it a perfectly good anchor reads as orphaned
	 * just because its container is shut.
	 */
	reveal?: string[];

	/** Where the pin sat, kept ONLY as a last-resort tiebreak and for rendering. */
	position: { x: number; y: number };

	capturedAt: string;
}

export type AnchorStatus = "attached" | "needsReview" | "orphaned";

export interface AnchorResolution {
	status: AnchorStatus;
	/** The element, when one was identified confidently enough to point at. */
	element: Element | null;
	/** Score of the best candidate, for debugging and for the UI to explain itself. */
	score: number;
	/** Which signals agreed, in human-readable form. */
	matched: string[];
	/** Which signals disagreed — what a reviewer needs to see. */
	changed: string[];
	/** Why this status, in one sentence. */
	reason: string;
}
