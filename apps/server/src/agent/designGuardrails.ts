import type { GuardrailViolation, PrototypeFile } from "@drydock/prototype";

/**
 * Wonderful Design Guardrails v0 — the operational half. The canon lives at
 * `docs/wonderful-design-guardrails.md`; this is the compact, prompt-ready
 * version merged into the model's system prompt, plus the mechanical checks
 * that turn the "hard gates" half of that doc into an actual gate rather than
 * a request the model is free to ignore.
 *
 * Two enforcement layers exist, and this file is honest about owning only
 * one of them:
 *   1. THIS FILE, at generation time, in `apps/server` — cheap, generic
 *      mistakes: importing something other than @wonderful/ui-base, inline
 *      styles, real network calls, unlabeled inputs, icon-only buttons with
 *      no label, obviously-inlined mock data. All regex/string heuristics
 *      over the raw source text, not an AST — apps/server has no parser and
 *      no vendored design system to check names against, and adding either
 *      for a v0 heuristic layer would be a lot of new surface for a problem
 *      the next layer already solves precisely.
 *   2. THE BROWSER COMPILER, in apps/web, at compile time — the authoritative
 *      check for "does this component/class actually exist in
 *      @wonderful/ui". It already rejects an unknown Tailwind utility class
 *      and would fail to resolve an invented component export; nothing here
 *      duplicates that, only the generation-time gates a compiler can't see
 *      (no compile step runs in apps/server).
 */

export const DESIGN_GUARDRAILS_PROMPT = `## Wonderful Design Guardrails v0

Beyond compiling, a Wonderful prototype has to be usable as the seed of a
real build. These are checked mechanically after you respond — getting one
wrong means a rejection and a chance to fix it, not a silent quality miss:

- Import ONLY "@wonderful/ui-base", "react", and your own relative files
  (e.g. "./Dashboard", "./agents.json"). No other package, ever.
- No inline styles (no \`style={{...}}\`). Use the design system's own
  spacing/layout props and utility classes instead.
- No real network calls (no \`fetch\`, \`XMLHttpRequest\`, \`WebSocket\`, or an
  HTTP client). This is a prototype — data is local, mocked, and honest
  about being mocked, never a call that looks real but silently fails.
- Every form input needs an associated label — an \`aria-label\`, or a visible
  label. Never render a bare input with no accessible name.
- An icon-only button (no visible text) needs an \`aria-label\`.
- Keep sample data in its own file (a \`.json\` import, or a small
  \`*Data.ts\` module) rather than a large literal inlined in a component —
  the UI and the data it happens to be showing are different things.
- Use logical direction utilities, never physical ones: \`ps-\`/\`pe-\`,
  \`ms-\`/\`me-\`, \`text-start\`/\`text-end\`, \`start-\`/\`end-\`,
  \`border-s-\`/\`border-e-\` — NOT \`pl-\`, \`pr-\`, \`ml-\`, \`mr-\`,
  \`text-left\`, \`text-right\`, \`left-\`, \`right-\`. Most Wonderful
  traffic is Hebrew and Arabic; a physically-anchored layout mirrors wrong.
- Never \`transition-all\` (or \`transition: all\`, \`will-change: all\`).
  Name the exact properties that change.

Also include a \`review\` alongside your files, honestly self-assessed —
this is shown to whoever reads the prototype, not graded against you:
- \`purpose\`: what this screen is for, one sentence.
- \`primaryAction\`: the one main thing a viewer is meant to do here.
- \`componentsUsed\`: the @wonderful/ui-base components you actually used.
- \`mockData\`: what's mocked and how, one sentence.
- \`knownGaps\`: things intentionally not wired for real (e.g. "permissions
  not enforced", "search is client-side only") — empty array if none.

Rate yourself "strong" | "medium" | "weak" on the five things a Wonderful
designer actually flags. Be honest — a "weak" tells a reviewer where to
look and costs you nothing:
- \`rubric.contrastLadder\`: does every text and icon sit on the 3-step
  ladder, and do siblings inside ONE control agree with each other? (The
  most common real failure, and it cuts both ways: an icon too dark beside
  a placeholder too light, in the same field.)
- \`rubric.spacingRhythm\`: did every gap come off the scale — no zero-gap
  pairing, and no dead space either?
- \`rubric.affordanceClarity\`: does everything that looks interactive act
  interactive, and is exactly one action styled primary?
- \`rubric.containerDepth\`: is every nested container earning it, or is
  there a box inside a box for its own sake?
- \`rubric.componentProvenance\`: is every part a real @wonderful/ui-base
  component or an honest composition of primitives — nothing hand-rolled
  that the design system already owns?

Plus:
- \`rubric.agentLineage\`: if this screen shows anything an agent decided or
  did, say where a reader goes to see WHY — the path from conclusion back
  to premise. If the screen has no agent output on it, say so plainly;
  that's a real answer, not a miss.
- \`rubric.stateCoverage\`: which of loading / empty / error / success /
  disabled / needs-attention you covered where relevant, and which you
  didn't — one sentence, not a checklist dump.
- \`rubric.critique\`: your own structured critique of the screen — see the
  critique section below for the dimensions and the shape of a finding.`;

const ALLOWED_BARE_IMPORTS = new Set(["react", "react-dom", "react/jsx-runtime", "@wonderful/ui-base"]);

const IMPORT_SPECIFIER_PATTERN = /import\s+(?:type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?["']([^"']+)["']/g;

const getImportSpecifiers = (contents: string): string[] => {
	const specifiers: string[] = [];
	for (const match of contents.matchAll(IMPORT_SPECIFIER_PATTERN)) {
		specifiers.push(match[1]);
	}
	return specifiers;
};

const isAllowedImport = (specifier: string): boolean =>
	ALLOWED_BARE_IMPORTS.has(specifier) || specifier.startsWith("./") || specifier.startsWith("../");

const NETWORK_CALL_PATTERN = /\bfetch\s*\(|\bnew\s+WebSocket\s*\(|\bXMLHttpRequest\b|\baxios\s*\./;

const INLINE_STYLE_PATTERN = /\bstyle\s*=\s*\{/;

/** A self-closing `<Input .../>` or `<input .../>` tag with no accessible
 * name attribute — the cheap, reliable case. A multi-line `<label>` wrapping
 * an input is NOT caught by this (a regex has no notion of "this input is a
 * descendant of that label"), so this heuristic under-reports rather than
 * over-reports, which is the safer direction for a gate that BLOCKS. */
const UNLABELED_INPUT_PATTERN = /<(?:Input|input)\b((?:(?!\/?>)[\s\S])*)\/>/g;
const HAS_ACCESSIBLE_NAME_PATTERN = /\b(aria-label|aria-labelledby|label)\s*=/;

/** A self-closing Button/button — definitionally has no text children, so an
 * icon-only control is almost always authored this way. A labeled button
 * (`<Button>Save</Button>`) is never self-closing, so this heuristic doesn't
 * flag it. */
const ICON_ONLY_CONTROL_PATTERN = /<(?:Button|button)\b((?:(?!\/?>)[\s\S])*)\/>/g;

/** Heuristic for "mock data belongs in its own file, not inlined": three or
 * more adjacent object literals read as an inline array-of-records. Approximate
 * by construction — see the module doc comment for why an AST isn't in scope
 * for v0. */
const INLINE_RECORD_ARRAY_PATTERN = /\}\s*,\s*\{/g;
const INLINE_RECORD_ARRAY_THRESHOLD = 2; // 2 boundaries = 3 adjacent object literals.

/**
 * The following four checks come from Wonderful's own internal design-craft
 * skills (`ui-visual-design`, `ui-components`; see `visualDesignPrinciples.ts`),
 * which already treat each of these as a hard/iron rule — no exceptions, not
 * a judgment call. That makes them a match for this repo's own promotion
 * rule: mechanically checkable AND already non-negotiable, not merely
 * aesthetic preference.
 */

/** `text-transform: uppercase`, or Tailwind's `uppercase` utility used
 * inside a `className`. Scoped to the `className` value specifically
 * (rather than a bare word search) so a real word like "Uppercase" in
 * ordinary UI copy or a comment is never mistaken for the class. */
const UPPERCASE_CSS_TRANSFORM_PATTERN = /text-transform\s*:\s*uppercase/;
const UPPERCASE_CLASSNAME_PATTERN =
	/className\s*=\s*(?:"[^"]*\buppercase\b[^"]*"|'[^']*\buppercase\b[^']*'|\{[^}]*\buppercase\b[^}]*\})/;

/** Hex colors, rgb()/rgba()/hsl()/hsla(), or a raw Tailwind color-shade
 * utility — all three are "hardcode a color" under a different spelling. */
const HARDCODED_COLOR_PATTERN =
	/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b|\b(?:rgb|rgba|hsl|hsla)\s*\(|\b(?:bg|text|border|from|via|to|ring|fill|stroke)-(?:red|blue|green|yellow|gray|grey|slate|zinc|neutral|stone|purple|violet|pink|rose|indigo|orange|amber|lime|emerald|teal|cyan|sky|fuchsia)-\d{2,3}\b/;

/** Tailwind's arbitrary-value bracket syntax (`w-[31px]`, `text-[13px]`,
 * `pt-[37px]`) — if it doesn't fit the design system's own scale, the
 * layout is off-grid, not the utility. */
const ARBITRARY_TAILWIND_VALUE_PATTERN = /\b[a-z][a-z-]*-\[[^\]]+\]/;

/**
 * The next two come from `Wonderful.ai: UX Guardrails for Agentic B2B` (see
 * `agenticUxGuardrails.ts`), which states both as "never". Both were
 * verified against the vendored design system before being gated, because
 * a gate whose fix the compiler then rejects is worse than no gate.
 */

/**
 * Physical direction utilities, where the design system uses logical ones.
 *
 * The business reason is load-bearing rather than stylistic: most Wonderful
 * conversation traffic is Hebrew and Arabic, so a physically-anchored
 * layout is mirrored wrong for the majority of real use.
 *
 * VERIFIED SAFE TO GATE: the vendored design system uses the logical forms
 * heavily (27 × `text-start`, dozens of `ps-`/`pe-`/`ms-`/`me-`, plus
 * `start-`/`end-`, `border-s-`, `rounded-s-`/`rounded-e-`), so Tailwind has
 * scanned and emitted them and `apps/web`'s utility check will accept the
 * fix this gate asks for. This repo's own known-good fixture
 * (`prototypeTree.ts` / `COMPONENT_EXAMPLE`) contains zero physical
 * direction utilities, so the gate does not contradict it.
 *
 * `rounded-l`/`rounded-r` are matched with a trailing boundary so the very
 * common `rounded-lg` is never mistaken for a physical corner utility.
 */
const PHYSICAL_DIRECTION_UTILITY = String.raw`(?:(?:pl|pr|ml|mr|border-l|border-r|left|right)-[a-z0-9.]|rounded-[lr]\b|text-(?:left|right)\b)`;
const PHYSICAL_DIRECTION_PATTERN = new RegExp(
	`className\\s*=\\s*(?:"[^"]*${PHYSICAL_DIRECTION_UTILITY}[^"]*"|'[^']*${PHYSICAL_DIRECTION_UTILITY}[^']*'|\\{[^}]*${PHYSICAL_DIRECTION_UTILITY}[^}]*\\})`,
);

/**
 * `transition-all` / `transition: all` / `will-change: all` — the document
 * says name the exact properties that change, because the daily loop is
 * someone triaging rows fast and a blanket transition animates things
 * nobody asked to move.
 *
 * NOT redundant with the compile-time utility check: the design system
 * itself ships `transition-all` (12 occurrences), so Tailwind emits it and
 * the compiler accepts it. This gate is the only thing standing between a
 * model's reflexive `transition-all duration-200` and the output. That the
 * design system violates its own document here is real, and flagged in
 * `docs/wonderful-design-guardrails.md` rather than quietly resolved in
 * either direction — a prototype author is still bound by the rule.
 */
const TRANSITION_ALL_PATTERN = /\btransition-all\b|transition\s*:\s*all\b|will-change\s*:\s*all\b/;

// NOTE: the uploaded ui-components skill also states a bare "Stack takes
// only gap + children — no className" iron rule. Deliberately NOT enforced
// here (and not asserted in the prompt): this repo's own known-good,
// actually-compiling fixture (systemPrompt.ts's COMPONENT_EXAMPLE, the same
// one apps/web's verify.ts proves against the real compiler) uses
// `<Layout.Stack gap="lg" className="p-8">` successfully. The skill's rule
// most likely describes a different, bare `Stack` export than `Layout.Stack`
// — but a mechanical gate or prompt claim contradicted by empirically
// verified behavior is worse than no gate at all, so this stays unenforced
// pending clarification of which component the rule actually applies to.

const checkFile = (file: PrototypeFile): GuardrailViolation[] => {
	const violations: GuardrailViolation[] = [];
	const isData = file.path.endsWith(".json") || /data\.tsx?$/i.test(file.path);

	for (const specifier of getImportSpecifiers(file.contents)) {
		if (!isAllowedImport(specifier)) {
			violations.push({
				rule: "no-external-libraries",
				message: `imports "${specifier}" — only "@wonderful/ui-base", "react", and relative files are allowed`,
				file: file.path,
			});
		}
	}

	if (NETWORK_CALL_PATTERN.test(file.contents)) {
		violations.push({
			rule: "no-real-network-calls",
			message: "contains a real network call (fetch/XMLHttpRequest/WebSocket/axios) — data must be local and mocked",
			file: file.path,
		});
	}

	if (INLINE_STYLE_PATTERN.test(file.contents)) {
		violations.push({
			rule: "no-inline-styles",
			message: "contains an inline style={{...}} — use the design system's spacing/layout props instead",
			file: file.path,
		});
	}

	if (UPPERCASE_CSS_TRANSFORM_PATTERN.test(file.contents) || UPPERCASE_CLASSNAME_PATTERN.test(file.contents)) {
		violations.push({
			rule: "no-uppercase-text-transform",
			message: "renders text in all caps (text-transform: uppercase or an \"uppercase\" class) — never do this to a word or sentence a person reads",
			file: file.path,
		});
	}

	if (HARDCODED_COLOR_PATTERN.test(file.contents)) {
		violations.push({
			rule: "no-hardcoded-colors",
			message: "hardcodes a color (hex/rgb/hsl, or a raw Tailwind color-shade class) instead of a design-system token",
			file: file.path,
		});
	}

	if (ARBITRARY_TAILWIND_VALUE_PATTERN.test(file.contents)) {
		violations.push({
			rule: "no-arbitrary-tailwind-values",
			message: "uses an arbitrary bracketed Tailwind value (e.g. w-[31px]) — if it doesn't fit the scale, the layout is off-grid",
			file: file.path,
		});
	}

	if (PHYSICAL_DIRECTION_PATTERN.test(file.contents)) {
		violations.push({
			rule: "no-physical-direction-utilities",
			message:
				"uses a physical direction utility (pl-/pr-/ml-/mr-/text-left/text-right/left-/right-) — most Wonderful traffic is RTL, so use the logical form (ps-/pe-, ms-/me-, text-start/text-end, start-/end-)",
			file: file.path,
		});
	}

	if (TRANSITION_ALL_PATTERN.test(file.contents)) {
		violations.push({
			rule: "no-transition-all",
			message: "uses transition-all / transition: all / will-change: all — name the exact properties that change",
			file: file.path,
		});
	}

	for (const match of file.contents.matchAll(UNLABELED_INPUT_PATTERN)) {
		if (!HAS_ACCESSIBLE_NAME_PATTERN.test(match[1])) {
			violations.push({
				rule: "no-unlabeled-inputs",
				message: "a form input has no aria-label, aria-labelledby, or label",
				file: file.path,
			});
		}
	}

	for (const match of file.contents.matchAll(ICON_ONLY_CONTROL_PATTERN)) {
		if (!HAS_ACCESSIBLE_NAME_PATTERN.test(match[1])) {
			violations.push({
				rule: "no-inaccessible-icon-controls",
				message: "a self-closing (icon-only) button has no aria-label",
				file: file.path,
			});
		}
	}

	if (!isData) {
		const boundaries = [...file.contents.matchAll(INLINE_RECORD_ARRAY_PATTERN)].length;
		if (boundaries > INLINE_RECORD_ARRAY_THRESHOLD) {
			violations.push({
				rule: "mock-data-separated",
				message: "looks like an inline array of records — move sample data into its own .json or *Data.ts file",
				file: file.path,
			});
		}
	}

	return violations;
};

/** Runs every mechanical hard gate over a candidate tree. Empty = passes. */
export const checkDesignGuardrails = (files: readonly PrototypeFile[]): GuardrailViolation[] =>
	files.flatMap(checkFile);

/** One line per violation, for feeding back to the model or a client. */
export const getGuardrailViolationSummary = (violations: readonly GuardrailViolation[]): string =>
	violations.map((v) => `- [${v.rule}]${v.file ? ` ${v.file}:` : ""} ${v.message}`).join("\n");
