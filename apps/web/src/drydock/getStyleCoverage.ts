import getKnownClasses from "./getKnownClasses";

/**
 * Splits a prototype's class names into the ones the host stylesheet can
 * actually style and the ones it cannot. Reported as a stat; the rejection
 * itself happens at compile time in `checkUtilityClasses`.
 */
export interface StyleCoverage {
	covered: string[];
	missing: string[];
}

export default function getStyleCoverage(classNames: string[]): StyleCoverage {
	const known = getKnownClasses();
	const covered: string[] = [];
	const missing: string[] = [];
	for (const className of classNames) {
		(known.has(className) ? covered : missing).push(className);
	}
	return { covered, missing };
}
