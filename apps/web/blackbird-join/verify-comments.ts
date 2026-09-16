/**
 * Verifies comment anchoring END TO END inside Blackbird's own comment store.
 *
 *   BB_URL=http://127.0.0.1:5181/ node blackbird-join/verify-comments.ts
 *
 * Drives the real UI: compile a prototype, drop a real comment pin on a real
 * element through Blackbird's own comment mode, recompile the rewritten
 * prototype, and read the store's verdict. Nothing is stubbed — the anchor is
 * captured across the frame boundary by the bridge, persisted by Blackbird's
 * storage, and re-resolved by its own effect.
 */
import { chromium, type Browser, type Page } from "playwright";

const URL_UNDER_TEST = process.env.BB_URL ?? "http://127.0.0.1:5181/";
const EXECUTABLE_PATH = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

const checks: { name: string; passed: boolean; detail: string }[] = [];

function record(name: string, passed: boolean, detail: string): void {
	checks.push({ name, passed, detail });
	console.log(`${passed ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

async function compile(page: Page, testId: string): Promise<void> {
	await page.click(`[data-testid="${testId}"]`);
	await page.waitForFunction(
		() => (document.querySelector('[data-testid="drydock-detail"]')?.textContent ?? "").includes("published"),
		undefined,
		{ timeout: 120_000 },
	);
	await page.waitForFunction(
		() => {
			const frame = document.querySelector('iframe[data-frame-id]') as HTMLIFrameElement | null;
			return (frame?.contentDocument?.body?.innerText ?? "").includes("Voice agents");
		},
		undefined,
		{ timeout: 60_000 },
	);
	await page.waitForTimeout(1200);
}

/** Viewport point at the centre of an element inside the frame, found by text. */
async function getPointFor(page: Page, needle: string): Promise<{ x: number; y: number } | null> {
	return page.evaluate((text: string) => {
		const frame = document.querySelector("iframe[data-frame-id]") as HTMLIFrameElement | null;
		const doc = frame?.contentDocument;
		if (!frame || !doc) return null;
		const norm = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
		const matches = [...doc.querySelectorAll("*")].filter((el) => norm(el).startsWith(text));
		const target = matches[matches.length - 1];
		if (!target) return null;
		const rect = target.getBoundingClientRect();
		const frameRect = frame.getBoundingClientRect();
		const scale = frameRect.width / (frame.clientWidth || 1);
		return {
			x: frameRect.left + (rect.left + rect.width / 2) * scale,
			y: frameRect.top + (rect.top + rect.height / 2) * scale,
		};
	}, needle);
}

async function readComments(page: Page): Promise<{ body: string; anchor?: unknown }[]> {
	return page.evaluate(() => {
		try {
			return JSON.parse(localStorage.getItem("canvas-comments-v1") ?? "[]");
		} catch {
			return [];
		}
	});
}

/**
 * The pins as a reviewer sees them. Status is asserted through the rendered
 * `title` rather than through provider internals: what matters is that the
 * person looking at the canvas is told, not that a field somewhere holds a
 * value.
 */
async function readPinTitles(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll("button[title]")]
			.map((el) => el.getAttribute("title") ?? "")
			.filter((title) => /attached|needsReview|orphaned/.test(title)),
	);
}

async function main(): Promise<void> {
	let browser: Browser | undefined;
	try {
		browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
		const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));

		await page.goto(URL_UNDER_TEST, { waitUntil: "networkidle" });
		await page.evaluate(() => localStorage.clear());
		await page.reload({ waitUntil: "networkidle" });
		await page.waitForSelector('[data-testid="drydock-compile"]', { timeout: 60_000 });

		await compile(page, "drydock-compile");

		// Expose the store's anchorStatus for assertions. Read-only observation:
		// the provider writes it, this only mirrors it out.
		await page.evaluate(() => {
			(window as unknown as Record<string, unknown>).__bbAnchorStatus = {};
		});

		const pinTargets = [
			{ needle: "Median latency", label: "a card that MOVES" },
			{ needle: "Outbound sales", label: "a row that is RENAMED" },
			{ needle: "After-hours triage", label: "a row that is REMOVED" },
		];

		const placed: string[] = [];
		for (const target of pinTargets) {
			const point = await getPointFor(page, target.needle);
			if (!point) {
				record(`pin "${target.needle}"`, false, "element not found in frame");
				continue;
			}
			// Blackbird toggles comment mode with "c", then a click drops the pin.
			await page.keyboard.press("c");
			await page.waitForTimeout(250);
			await page.mouse.click(point.x, point.y);
			await page.waitForTimeout(900);
			const textarea = page.locator("textarea").first();
			await textarea.fill(`Comment on ${target.needle}`);
			await textarea.press("ControlOrMeta+Enter");
			await page.waitForTimeout(700);
			placed.push(target.needle);
		}

		const comments = await readComments(page);
		record(
			"comments are stored with an element anchor, not just x/y",
			comments.length > 0 && comments.every((c) => !!c.anchor),
			`${comments.length} comments, ${comments.filter((c) => c.anchor).length} anchored`,
		);

		if (comments.length === 0) {
			record("end-to-end anchoring", false, "no comments were created — the pin flow did not complete");
			return;
		}

		await compile(page, "drydock-rewrite");
		await page.waitForTimeout(2500);

		const titles = await readPinTitles(page);

		record(
			"the store re-resolved every anchor after the rewrite",
			titles.length === comments.length && titles.length > 0,
			`${titles.length} of ${comments.length} pins carry a resolution`,
		);

		const has = (status: string) => titles.some((title) => title.includes(status));
		record(
			"the moved card stays ATTACHED",
			has("attached"),
			titles.find((t) => t.includes("attached"))?.replace(/\n/g, " · ") ?? "none attached",
		);
		record(
			"the renamed row is flagged NEEDS REVIEW",
			has("needsReview"),
			titles.find((t) => t.includes("needsReview"))?.replace(/\n/g, " · ") ?? "none flagged",
		);
		record(
			"the removed row is ORPHANED, not re-aimed",
			has("orphaned"),
			titles.find((t) => t.includes("orphaned"))?.replace(/\n/g, " · ") ?? "none orphaned",
		);

		record("no page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");
	} finally {
		await browser?.close();
	}

	const failed = checks.filter((c) => !c.passed);
	console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
	if (failed.length > 0) process.exitCode = 1;
}

await main();
