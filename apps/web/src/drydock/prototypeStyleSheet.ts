/**
 * The stylesheet a prototype is styled by, as text. Supplied by the host.
 *
 * The engine deliberately does NOT import the design system's CSS itself.
 * Tailwind resolves `@plugin` / `@import` relative to the entry stylesheet, so
 * an import here would make the engine's own directory the resolution base and
 * every host would need the design system's CSS dependencies installed beside
 * it. Letting the host pass the compiled text keeps the engine portable: the
 * spike passes its own sheet, and a different canvas (Blackbird) passes the one
 * its build produced, with no shared build assumptions between them.
 *
 * The utility checker and the mount path both read this, so what gets rejected
 * and what gets rendered can never disagree.
 */
let styles: string | null = null;

export function setPrototypeStyles(css: string): void {
	styles = css;
}

export default function getPrototypeStyles(): string {
	if (styles === null) {
		throw new Error(
			"No prototype stylesheet set. Call setPrototypeStyles(css) with the design system's compiled CSS before compiling or mounting.",
		);
	}
	return styles;
}
