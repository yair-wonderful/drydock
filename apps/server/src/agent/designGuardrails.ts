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

Also include a \`review\` alongside your files, honestly self-assessed —
this is shown to whoever reads the prototype, not graded against you:
- \`purpose\`: what this screen is for, one sentence.
- \`primaryAction\`: the one main thing a viewer is meant to do here.
- \`componentsUsed\`: the @wonderful/ui-base components you actually used.
- \`mockData\`: what's mocked and how, one sentence.
- \`knownGaps\`: things intentionally not wired for real (e.g. "permissions
  not enforced", "search is client-side only") — empty array if none.
- \`rubric.wonderfulFit\`: "strong" | "medium" | "weak" — does this read as an
  actual Wonderful product screen, not a generic SaaS landing page?
- \`rubric.handoffReadiness\`: "strong" | "medium" | "weak" — could an
  engineer tell what to copy, what to replace, and what's intentionally
  mocked?
- \`rubric.stateCoverage\`: which of loading / empty / error / success /
  disabled / needs-attention you covered where relevant, and which you
  didn't — one sentence, not a checklist dump.`;

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
