/** One source file of a prototype. */
export type PrototypeFile = {
	/**
	 * Relative, POSIX-style, no leading slash, no "..". Enforced by
	 * `validateFileTree` before anything is stored — see the note there on why
	 * this is a security boundary rather than a formatting preference.
	 */
	path: string;
	contents: string;
};

/**
 * A version's whole source tree.
 *
 * An ordered array rather than a `path -> contents` map, so authoring order
 * survives a round trip: the tree is shown as a file list, and an object would
 * re-sort it by key on every read. Path uniqueness is enforced by validation,
 * not by the type.
 */
export type PrototypeFileTree = readonly PrototypeFile[];

/**
 * Why a tree was refused. Carried as a code rather than only a message so the
 * server can map it to a status and the editor can point at the offending file
 * without parsing prose.
 */
export type PrototypeValidationCode =
	| "files_required"
	| "too_many_files"
	| "source_too_large"
	| "invalid_file_path"
	| "duplicate_file_path"
	| "entry_point_missing";

export type PrototypeValidationError = {
	code: PrototypeValidationCode;
	message: string;
	/** The offending path, when one file is to blame. */
	path?: string;
};

export type ValidatedTree = {
	files: PrototypeFileTree;
	entryPoint: string;
	totalBytes: number;
};

/**
 * Validation returns a result rather than throwing.
 *
 * Both callers want the failure as data: the editor renders it next to the file
 * that caused it, and the server maps the code to a status. An exception would
 * make the browser's job harder for no gain on the server's.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: PrototypeValidationError };

/** A subjective self-rating, on the Wonderful Design Guardrails rubric. Never
 * blocks anything — see `docs/wonderful-design-guardrails.md`. */
export type GuardrailFitRating = "strong" | "medium" | "weak";

/**
 * The agent's own account of what it built, attached to every generation —
 * "Guardrails v0"'s rubric layer. Shown alongside a prototype, never
 * mechanically enforced: a rating here is a self-report from the model that
 * wrote the tree, not a verified fact. It exists so a reviewer (human or a
 * later automated pass) has something concrete to check the work against,
 * and so repeated patterns in `knownGaps` / weak ratings have somewhere to
 * accumulate before any of them earns promotion to a hard gate.
 */
export type DesignReview = {
	/** What this screen is for, in one sentence. */
	purpose: string;
	/** The one primary action a viewer is meant to take. */
	primaryAction: string;
	/** The @wonderful/ui-base components actually used. */
	componentsUsed: string[];
	/** What's mocked and how, in one sentence. */
	mockData: string;
	/** Things intentionally NOT wired for real — e.g. "permissions not enforced". */
	knownGaps: string[];
	rubric: DesignReviewRubric;
};

/**
 * The self-assessment axes, derived from what a Wonderful design reviewer
 * actually flags rather than from first principles — see
 * `apps/server/src/agent/designReviewCorpus.ts`, a transcription of 31
 * review comments on four real Wonderful screens, and
 * `docs/wonderful-design-guardrails.md` for how the axes were chosen.
 *
 * The previous axes (`wonderfulFit`, `handoffReadiness`) were replaced
 * because they were too abstract to act on: a "medium" told a reviewer
 * nothing about where to look. These five name the specific failure
 * clusters that account for nearly every real comment, so a weak rating
 * points at a part of the screen.
 */
export type DesignReviewRubric = {
	/** Does every text and icon sit on the 3-step ladder, and do siblings
	 * inside one control agree? The single most-flagged failure in the
	 * corpus (8 of 34 remarks), and it cuts both ways — too light AND too
	 * dark, sometimes in the same field. */
	contrastLadder: GuardrailFitRating;
	/** Did every gap come off the spacing scale, with no zero-gap pairing and
	 * no dead space? Second most-flagged (6 of 34). */
	spacingRhythm: GuardrailFitRating;
	/** Does everything that looks interactive act interactive, and is exactly
	 * one action styled primary? */
	affordanceClarity: GuardrailFitRating;
	/** Is every nested container earning its nesting — no box inside a box
	 * for its own sake? */
	containerDepth: GuardrailFitRating;
	/** Is every part a real @wonderful/ui-base component or an honest
	 * composition of primitives, with nothing hand-rolled that the design
	 * system already owns? */
	componentProvenance: GuardrailFitRating;
	/**
	 * Where a reader goes to see WHY an agent concluded what it concluded —
	 * the path from conclusion back to premise. "No agent output on this
	 * screen" is a valid answer.
	 *
	 * Prose rather than a rating because the not-applicable case is common
	 * and real: a settings screen has no lineage to show, and a "strong"
	 * there would be noise. From the agentic-UX guardrails' first principle
	 * — see `apps/server/src/agent/agenticUxGuardrails.ts`.
	 */
	agentLineage: string;
	/** Which of loading/empty/error/success/disabled/needs-attention are
	 * covered where relevant, and which are missing.
	 *
	 * Kept from the original rubric despite having no corpus support: the
	 * corpus is static screenshots of one state each, so its silence on
	 * state coverage is a sampling artifact, not evidence it doesn't
	 * matter. */
	stateCoverage: string;
	/**
	 * Comments you expect a Wonderful reviewer to leave on this screen —
	 * short, specific, in their voice ("placeholder too light", "why box in
	 * box?"). The most useful field in the rubric: it turns the model's
	 * uncertainty into the reviewer's agenda instead of hiding it behind a
	 * rating.
	 */
	selfFlagged: string[];
};

/** One mechanically-checked hard-gate failure — see
 * `apps/server/src/agent/designGuardrails.ts`. */
export type GuardrailViolation = {
	rule: string;
	message: string;
	file?: string;
};
