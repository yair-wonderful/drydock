/**
 * Phase 0 verification. Drives the running spike in a real browser and asserts
 * the four claims the spike exists to test, so the result is reproducible
 * rather than a screenshot someone has to trust.
 *
 *   pnpm run dev      # in one shell
 *   pnpm run verify   # in another
 *
 * Chromium comes from PLAYWRIGHT_BROWSERS_PATH when the pinned Playwright
 * build is not the one installed locally.
 */
import { chromium, type Browser, type Page } from "playwright";

const URL_UNDER_TEST = process.env.SPIKE_URL ?? "http://127.0.0.1:5199/";
const EXECUTABLE_PATH = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

/**
 * A utility class that provably appears nowhere on disk. It is ASSEMBLED at
 * runtime from a random value, because Tailwind v4's auto content detection
 * scans this project's own files: a literal `pt-[37px]` written here is enough
 * for Tailwind to emit the rule, which silently invalidates the test. That
 * mistake is easy to make and hard to see, so the value is generated instead.
 */
const NOVEL_PIXELS = 11 + Math.floor(Math.random() * 80);
const NOVEL_CLASS = ["pt", `[${NOVEL_PIXELS}px]`].join("-");

interface Check {
	name: string;
	passed: boolean;
	detail: string;
}

const checks: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
	checks.push({ name, passed, detail });
	console.log(`${passed ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

interface StageState {
	hasShadow: boolean;
	adoptedSheets: number;
	textSample: string;
	surfaceBackground: string;
	uiBaseExports: number;
	anchorTotal: number;
	anchorLoops: number;
	noFailures: boolean;
	compileErrors: string;
	stillMounted: boolean;
	isStale: boolean;
}

/**
 * Waits for a mount to actually land, rather than sleeping and hoping. A cold
 * load pays for esbuild-wasm initialisation and Vite's dep optimisation, so a
 * fixed delay is a race: the first version of this script slept 2.5s and
 * intermittently read the stage before the shadow root existed.
 */
async function waitForMount(page: Page): Promise<void> {
	await page.waitForFunction(
		() => {
			const mount = document.querySelector('[data-testid="prototype-mount"]');
			const host = mount?.firstElementChild as HTMLElement | null;
			const shadowRoot = host?.shadowRoot ?? null;
			return !!shadowRoot && (shadowRoot.textContent?.length ?? 0) > 0;
		},
		undefined,
		{ timeout: 60_000 },
	);
}

async function readStage(page: Page): Promise<StageState> {
	return page.evaluate(() => {
		const mount = document.querySelector('[data-testid="prototype-mount"]');
		const host = mount?.firstElementChild as HTMLElement | null;
		const shadowRoot = host?.shadowRoot ?? null;
		const surface = shadowRoot?.firstElementChild as HTMLElement | null;
		const shared = (globalThis as unknown as Record<string, unknown>)["__DRYDOCK_SHARED__"] as
			| Record<string, Record<string, unknown>>
			| undefined;
		const anchors = (globalThis as unknown as Record<string, unknown>)["__WF_ANCHORS__"] as
			| Record<string, Record<string, string>>
			| undefined;

		return {
			hasShadow: !!shadowRoot,
			adoptedSheets: shadowRoot?.adoptedStyleSheets.length ?? 0,
			textSample: shadowRoot?.textContent?.slice(0, 160) ?? "",
			surfaceBackground: surface ? getComputedStyle(surface).backgroundColor : "",
			uiBaseExports: Object.keys(shared?.["@wonderful/ui-base"] ?? {}).length,
			anchorTotal: Object.keys(anchors ?? {}).length,
			anchorLoops: document
				.querySelector('[data-testid="report-panel"]')
				?.textContent?.match(/\((\d+) in loops\)/)?.[1] as unknown as number ?? 0,
			noFailures: !!document.querySelector('[data-testid="report-ok"]'),
			compileErrors:
				document.querySelector('[data-testid="compile-errors"]')?.textContent ?? "",
			stillMounted: !!shadowRoot && (shadowRoot.textContent?.length ?? 0) > 0,
			isStale: !!document.querySelector('[data-testid="stage-stale"]'),
		};
	});
}

async function main(): Promise<void> {
	let browser: Browser | undefined;
	try {
		browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
		const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
		const failedRequests: string[] = [];
		page.on("response", (response) => {
			if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
		});
		const pageErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));

		await page.goto(URL_UNDER_TEST, { waitUntil: "networkidle" });
		await page.waitForSelector('[data-testid="report-panel"]', { timeout: 60_000 });
		await waitForMount(page);

		const light = await readStage(page);

		// 1 — the core hypothesis.
		record(
			"compiles in-browser and mounts on the app runtime",
			light.hasShadow && light.adoptedSheets === 1 && light.noFailures,
			`shadowRoot=${light.hasShadow} adoptedSheets=${light.adoptedSheets} noFailures=${light.noFailures}`,
		);

		// 2 — it is the REAL design system, via the host import map.
		record(
			"prototype resolves @wonderful/ui-base to the host instance",
			light.uiBaseExports > 100 && light.textSample.includes("Voice agents"),
			`${light.uiBaseExports} exports reachable; rendered "${light.textSample.slice(0, 60)}…"`,
		);

		// 3 — design mode survives: the anchor pass runs in the browser.
		record(
			"source anchors emitted in-browser, loops flagged",
			light.anchorTotal > 0 && Number(light.anchorLoops) > 0,
			`${light.anchorTotal} anchors, ${light.anchorLoops} inside .map() callbacks`,
		);

		// 4 — tokens inherit across the shadow boundary; dark mode needs no rebuild.
		await page.click('[data-testid="toggle-mode"]');
		await page.waitForFunction(
			(previous: string) => {
				const mount = document.querySelector('[data-testid="prototype-mount"]');
				const host = mount?.firstElementChild as HTMLElement | null;
				const surface = host?.shadowRoot?.firstElementChild as HTMLElement | null;
				return !!surface && getComputedStyle(surface).backgroundColor !== previous;
			},
			light.surfaceBackground,
			{ timeout: 60_000 },
		);
		const dark = await readStage(page);
		record(
			"dark mode flips with no recompile of the design system",
			dark.surfaceBackground !== light.surfaceBackground && dark.hasShadow,
			`light=${light.surfaceBackground} dark=${dark.surfaceBackground}`,
		);

		// 5 — the Tailwind limit, measured rather than asserted.
		await page.click('[data-testid="file-editor"] .tab:has-text("Dashboard.tsx")');
		const source = await page.inputValue('[data-testid="file-source"]');
		await page.fill(
			'[data-testid="file-source"]',
			source.replace('className="p-8"', `className="p-8 ${NOVEL_CLASS}"`),
		);
		await page.waitForFunction(
			(novelClass: string) =>
				document
					.querySelector('[data-testid="compile-errors"]')
					?.textContent?.includes(novelClass) ?? false,
			NOVEL_CLASS,
			{ timeout: 60_000 },
		);
		const withNovel = await readStage(page);
		record(
			"a runtime-invented utility class is REJECTED at compile time",
			withNovel.compileErrors.includes(NOVEL_CLASS) &&
				withNovel.compileErrors.includes("src/Dashboard.tsx"),
			`class="${NOVEL_CLASS}" → ${withNovel.compileErrors.trim().slice(0, 200)}`,
		);

		// The reported line must be the line the AUTHOR sees. Checking the
		// post-Babel tree instead of the original silently shifts every number.
		const reportedLine = Number(
			withNovel.compileErrors.match(/src\/Dashboard\.tsx:(\d+):/)?.[1] ?? 0,
		);
		const editorSource = await page.inputValue('[data-testid="file-source"]');
		const lineText = editorSource.split("\n")[reportedLine - 1] ?? "";
		record(
			"the reported line matches the author's source, not generated code",
			reportedLine > 0 && lineText.includes(NOVEL_CLASS),
			`reported line ${reportedLine} = ${JSON.stringify(lineText.trim().slice(0, 70))}`,
		);

		// The rejection must also point at the design system's own answer, or it
		// is just a refusal. `pt-*` is spacing, so it should name `gap`/`Card`.
		// A rejection must not cost you the page you were working on.
		record(
			"a rejected compile keeps the last good render on screen",
			withNovel.stillMounted && withNovel.isStale,
			`mounted=${withNovel.stillMounted} staleMarkerShown=${withNovel.isStale}`,
		);

		record(
			"the rejection names the design-system alternative",
			/gap|Card|Layout/.test(withNovel.compileErrors),
			withNovel.compileErrors.includes("gap")
				? "suggests `gap` on a Layout.*, or a Card's own inset"
				: `no suggestion found in: ${withNovel.compileErrors.slice(0, 160)}`,
		);

		// And a design-system class must still be accepted — the rule is "no
		// class without a rule", not "no utility classes".
		const restored = await page.inputValue('[data-testid="file-source"]');
		await page.fill('[data-testid="file-source"]', restored.replace(` ${NOVEL_CLASS}`, ""));
		// Wait for the FAILURE TO CLEAR, not for a mount: the stale render is
		// still mounted from the rejected compile, so `waitForMount` would
		// return immediately and read the previous state.
		await page.waitForSelector('[data-testid="report-ok"]', { timeout: 60_000 });
		const recovered = await readStage(page);
		record(
			"a covered utility class (p-8) still compiles and mounts",
			recovered.noFailures && recovered.stillMounted,
			`noFailures=${recovered.noFailures} mounted=${recovered.stillMounted}`,
		);

		if (failedRequests.length > 0) {
			console.log(`\nnon-fatal failed requests:\n  ${failedRequests.join("\n  ")}`);
		}
		if (pageErrors.length > 0) {
			console.log(`\npage errors:\n  ${pageErrors.join("\n  ")}`);
		}
	} finally {
		await browser?.close();
	}

	const failed = checks.filter((check) => !check.passed);
	console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
	if (failed.length > 0) {
		process.exitCode = 1;
	}
}

await main();
