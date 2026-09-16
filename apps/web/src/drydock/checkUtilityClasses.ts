import getKnownClasses from "./getKnownClasses";
import type { CompileMessage, PrototypeTree } from "./types";

/**
 * Rejects utility classes that have no rule behind them, at compile time.
 *
 * Without this, a prototype that writes `className="pt-[37px]"` compiles
 * cleanly, renders, and is simply wrong — no error anywhere, just spacing that
 * never happens. That is the worst failure mode a prototyping tool can have,
 * because the author's next move is to doubt their own eyes.
 *
 * The rule is deliberately NOT "no utility classes". It is "no class the
 * adopted stylesheet cannot style", which is a correctness check rather than a
 * style policy: `p-8` is fine because the design system already caused it to
 * be emitted, and `pt-[37px]` is not because nothing did.
 *
 * The trade-off worth knowing: the covered set is incidental — it is whatever
 * `libs/ui` happened to use. A prototype using `p-8` compiles today and could
 * stop compiling if the library's last `p-8` disappeared. That is a real
 * fragility, and still strictly better than silent breakage, because it fails
 * loudly at the moment of authoring with a message saying what to do instead.
 */

interface ClassUsage {
	className: string;
	file: string;
	line: number;
	column: number;
}

const STATIC_CLASSNAME = /className\s*=\s*"([^"]*)"/g;
const DYNAMIC_CLASSNAME = /className\s*=\s*\{/;

/**
 * What to reach for instead. Ordered, first match wins — these cover the
 * classes a model reaches for most, and the advice is the design system's own
 * answer rather than "use a different utility".
 */
const SUGGESTIONS: ReadonlyArray<readonly [RegExp, string]> = [
	[/^gap-/, "set `gap` on `Layout.Stack` / `Layout.Row` / `Layout.Grid`"],
	[
		/^(p|m)[xytblre]?-/,
		"let the layout own spacing: `gap` on a `Layout.*`, or a `Card`, which carries its own inset",
	],
	[
		/^(flex|grid|items-|justify-|self-|place-)/,
		"use `Layout.Row` (one line), `Layout.Stack` (one under another) or `Layout.Grid` (equal tiles)",
	],
	[/^(text-|font-|leading-|tracking-)/, "use `<Text variant=… color=… />`"],
	[/^(bg-|border|rounded|shadow|ring)/, "use `Card` / `Elevation`, or a design token: `[var(--…)]`"],
	[/^(w-|h-|min-|max-|size-)/, "size from the layout, or use a design token"],
];

function getSuggestion(className: string): string {
	for (const [pattern, advice] of SUGGESTIONS) {
		if (pattern.test(className)) {
			return advice;
		}
	}
	return "compose it from `@wonderful/ui-base`, or use a design token: `[var(--…)]`";
}

function getUsages(tree: PrototypeTree): ClassUsage[] {
	const usages: ClassUsage[] = [];
	for (const [file, source] of Object.entries(tree)) {
		if (!/\.[jt]sx$/.test(file)) {
			continue;
		}
		source.split("\n").forEach((text, index) => {
			for (const match of text.matchAll(STATIC_CLASSNAME)) {
				const attributeStart = match.index ?? 0;
				for (const className of match[1].split(/\s+/)) {
					if (className) {
						usages.push({
							className,
							file,
							line: index + 1,
							column: attributeStart + 1,
						});
					}
				}
			}
		});
	}
	return usages;
}

function getDynamicWarnings(tree: PrototypeTree): CompileMessage[] {
	const warnings: CompileMessage[] = [];
	for (const [file, source] of Object.entries(tree)) {
		if (!/\.[jt]sx$/.test(file)) {
			continue;
		}
		source.split("\n").forEach((text, index) => {
			if (DYNAMIC_CLASSNAME.test(text)) {
				warnings.push({
					text: "Computed className cannot be checked for missing utility rules, so any class it produces may silently do nothing. Prefer a literal className.",
					file,
					line: index + 1,
					column: 1,
				});
			}
		});
	}
	return warnings;
}

export interface UtilityCheck {
	errors: CompileMessage[];
	warnings: CompileMessage[];
}

export default function checkUtilityClasses(tree: PrototypeTree): UtilityCheck {
	const known = getKnownClasses();
	const seen = new Set<string>();
	const errors: CompileMessage[] = [];

	for (const usage of getUsages(tree)) {
		if (known.has(usage.className)) {
			continue;
		}
		// One error per class, at its first use — a class repeated across a
		// dozen elements is one mistake, not a dozen.
		const key = `${usage.file}:${usage.className}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		errors.push({
			text: `Unknown utility class "${usage.className}": nothing in the design system's stylesheet emits a rule for it, so it would render with no effect. Instead, ${getSuggestion(usage.className)}.`,
			file: usage.file,
			line: usage.line,
			column: usage.column,
		});
	}

	return { errors, warnings: getDynamicWarnings(tree) };
}
