import type { AnchorSignals, Signal } from "./types";

/**
 * Records everything that might still identify this element after the page is
 * rewritten — and, for each signal, whether it was unique AT CAPTURE TIME.
 *
 * That uniqueness flag is what stops the resolver trusting weak evidence: a
 * `text` of "Live" that already matched four elements when the comment was
 * written can never later prove which one was meant, and the resolver must know
 * that rather than rediscover it and guess.
 */

const MAX_TEXT = 80;

function getText(element: Element): string {
	return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

function countMatching(root: ParentNode, predicate: (el: Element) => boolean): number {
	let count = 0;
	for (const element of root.querySelectorAll("*")) {
		if (predicate(element)) {
			count += 1;
			if (count > 1) return count;
		}
	}
	return count;
}

function signal<T>(value: T | null | undefined, unique: boolean): Signal<T> | undefined {
	return value === null || value === undefined || value === "" ? undefined : { value, unique };
}

/** `tag:nth-of-type` steps from the document root — deliberately brittle, and used as such. */
function getPath(element: Element): string {
	const steps: string[] = [];
	let current: Element | null = element;
	while (current && current.parentElement) {
		const tag = current.tagName.toLowerCase();
		const siblings = [...current.parentElement.children].filter(
			(child) => child.tagName === current!.tagName,
		);
		steps.unshift(siblings.length > 1 ? `${tag}:${siblings.indexOf(current) + 1}` : tag);
		current = current.parentElement;
	}
	return steps.join("/");
}

/**
 * The repeated group this element belongs to, if any.
 *
 * A "list" here is a parent whose children share a tag and a shape. The item's
 * own leading text is a far better key than its index: when rows reorder, the
 * text follows the row and the index does not.
 */
function getListIdentity(element: Element): { key?: string; index?: number } {
	const parent = element.parentElement;
	if (!parent) return {};
	const siblings = [...parent.children].filter((child) => child.tagName === element.tagName);
	if (siblings.length < 2) return {};
	return { key: getText(element).slice(0, 40), index: siblings.indexOf(element) };
}

/** Collapsed ancestors that would hide this element until opened. */
function getReveal(element: Element): string[] {
	const reveal: string[] = [];
	let current: Element | null = element.parentElement;
	while (current) {
		const tag = current.tagName.toLowerCase();
		if (tag === "details" && !(current as HTMLDetailsElement).open) {
			reveal.push("details");
		}
		if (current.getAttribute("aria-hidden") === "true" || current.hasAttribute("hidden")) {
			reveal.push(current.getAttribute("role") ?? tag);
		}
		current = current.parentElement;
	}
	return reveal;
}

export default function captureAnchor(
	element: Element,
	position: { x: number; y: number },
	/**
	 * The tree uniqueness is measured against. Defaults to the element's own
	 * root, which for a prototype inside a shadow root IS that shadow root —
	 * NOT `ownerDocument`, whose `querySelectorAll` does not pierce the shadow
	 * boundary and therefore reports every signal as ambiguous. It must be the
	 * same root the resolver later searches, or "unique" means nothing.
	 */
	root: ParentNode = element.getRootNode() as ParentNode,
): AnchorSignals {
	const source = element.getAttribute("data-source-id");
	const dsComponent = element.getAttribute("data-ds-component");
	const domId = element.getAttribute("id");
	const testId = element.getAttribute("data-testid");
	const ariaLabel = element.getAttribute("aria-label");
	const text = getText(element);
	const list = getListIdentity(element);

	return {
		source: signal(source, source ? countMatching(root, (el) => el.getAttribute("data-source-id") === source) === 1 : false),
		sourceFile: element.getAttribute("data-source-file") ?? undefined,
		sourceLine: Number(element.getAttribute("data-source-line")) || undefined,
		sourceName: element.getAttribute("data-source-name") ?? undefined,

		dsComponent: signal(dsComponent, dsComponent ? countMatching(root, (el) => el.getAttribute("data-ds-component") === dsComponent) === 1 : false),
		dsVariant: element.getAttribute("data-ds-variant") ?? undefined,

		domId: signal(domId, domId ? countMatching(root, (el) => el.id === domId) === 1 : false),
		testId: signal(testId, testId ? countMatching(root, (el) => el.getAttribute("data-testid") === testId) === 1 : false),

		text: signal(text, text ? countMatching(root, (el) => getText(el) === text) === 1 : false),
		ariaLabel: signal(ariaLabel, ariaLabel ? countMatching(root, (el) => el.getAttribute("aria-label") === ariaLabel) === 1 : false),
		role: element.getAttribute("role") ?? undefined,

		path: getPath(element),
		listKey: signal(list.key, list.key ? countMatching(root, (el) => getText(el).slice(0, 40) === list.key) === 1 : false),
		listIndex: list.index,
		reveal: getReveal(element),

		position,
		capturedAt: new Date().toISOString(),
	};
}

export { getText, getPath };
