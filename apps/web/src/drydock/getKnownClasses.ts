import getPrototypeStyles from "./prototypeStyleSheet";

/**
 * Every class name that actually has a rule in the stylesheet adopted into a
 * prototype's shadow root.
 *
 * This is the ground truth for utility rejection. Tailwind v4 is a build-time
 * scanner — `libs/ui/src/styles/index.css` states it outright: "Tailwind only
 * emits a utility whose class name it has SEEN". Classes reachable from the
 * design system were scanned via its `@source` lines; a class a prototype
 * invents at runtime was not, and would silently do nothing.
 *
 * Parsed into a Set rather than substring-matched against the sheet: a
 * substring test says `.p-8` is present when the sheet only contains
 * `.p-80`, and an error message is only worth emitting if it is right.
 */

// A class selector, allowing Tailwind's backslash escapes (`.pt-\[37px\]`,
// `.w-1\/2`, `.hover\:bg-x`). Over-matching is the safe direction here: a
// stray match only means one fewer rejection, never a false one.
const CLASS_SELECTOR = /\.((?:[A-Za-z0-9_-]|\\.)+)/g;

function createKnownClasses(): ReadonlySet<string> {
	const known = new Set<string>();
	for (const match of getPrototypeStyles().matchAll(CLASS_SELECTOR)) {
		// Undo the CSS escaping so the name matches what an author writes in
		// `className`: `pt-\[37px\]` → `pt-[37px]`.
		known.add(match[1].replace(/\\(.)/g, "$1"));
	}
	return known;
}

let cached: ReadonlySet<string> | null = null;

export default function getKnownClasses(): ReadonlySet<string> {
	cached ??= createKnownClasses();
	return cached;
}
