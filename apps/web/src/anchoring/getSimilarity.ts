/**
 * How alike two pieces of text are, 0..1 (Sørensen–Dice over character bigrams).
 *
 * Needed because exact text comparison cannot tell a RENAME from a DELETION,
 * and a rewrite renames things constantly. Without this, "Outbound sales" →
 * "Outbound sales (EMEA)" reads as "the element I was pinned to is gone",
 * every copy edit orphans its comments, and people stop trusting the feature.
 *
 * A near match is deliberately NOT treated as a match: it scores partial weight
 * and is recorded as CHANGED, which is what turns the resolution into
 * `needsReview`. The element is probably still there; what it says is not what
 * it said. That is precisely the case a human has to look at.
 */

function getBigrams(value: string): Map<string, number> {
	const bigrams = new Map<string, number>();
	const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
	for (let i = 0; i < normalized.length - 1; i += 1) {
		const pair = normalized.slice(i, i + 2);
		bigrams.set(pair, (bigrams.get(pair) ?? 0) + 1);
	}
	return bigrams;
}

export default function getSimilarity(a: string, b: string): number {
	if (a === b) return 1;
	if (!a || !b) return 0;

	const left = getBigrams(a);
	const right = getBigrams(b);
	let shared = 0;
	for (const [pair, count] of left) {
		const other = right.get(pair);
		if (other) shared += Math.min(count, other);
	}
	const total = [...left.values()].reduce((sum, n) => sum + n, 0) +
		[...right.values()].reduce((sum, n) => sum + n, 0);
	return total === 0 ? 0 : (2 * shared) / total;
}
