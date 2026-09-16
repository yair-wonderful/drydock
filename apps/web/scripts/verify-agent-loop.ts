/**
 * Verifies the interactive agent loop in a real browser.
 *
 *   # shell 1
 *   pnpm --filter @drydock/server run dev
 *
 *   # shell 2
 *   pnpm --filter @drydock/web run dev -- --host 127.0.0.1 --port 5199
 *
 *   # shell 3
 *   pnpm --filter @drydock/web run verify:agent-loop
 *
 * The check intentionally drives the UI controls rather than calling the agent
 * client directly: Generate must update the current prototype, Rewrite must
 * apply to that same in-memory tree, and a captured anchor must still resolve
 * after the rewrite.
 */
import { chromium, type Browser, type Page } from "playwright";

const URL_UNDER_TEST = process.env.SPIKE_URL ?? "http://127.0.0.1:5199/";
const EXECUTABLE_PATH = process.env.CHROMIUM_PATH;
const TIMEOUT_MS = Number(process.env.DRYDOCK_AGENT_LOOP_TIMEOUT_MS ?? 240_000);

const GENERATE_PROMPT =
	process.env.DRYDOCK_AGENT_LOOP_PROMPT ??
	`Build a compact support operations dashboard named "Harbor Ops".
Use Wonderful UI base components.
Include three queue rows with exact visible labels "Escalations", "Billing", and "General Support".
Include two small metrics and keep the prototype small.`;

const REWRITE_INSTRUCTION =
	process.env.DRYDOCK_AGENT_LOOP_REWRITE ??
	`Change the page title to "Harbor Ops Live".
Keep the visible label "Escalations" unchanged and still present.
Add a small warning tag or badge near Escalations labelled "Needs attention".
Return the complete rewritten tree.`;

interface Check {
	name: string;
	passed: boolean;
	detail: string;
}

interface CapturedAnchor {
	capturedText: string;
	signals: unknown;
}

interface Resolution {
	status: string;
	score: number;
	matched: string[];
	changed: string[];
	reason: string;
	resolvedText: string | null;
}

const checks: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
	checks.push({ name, passed, detail });
	console.log(`${passed ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

async function launchBrowser(): Promise<Browser> {
	try {
		return await chromium.launch({
			...(EXECUTABLE_PATH ? { executablePath: EXECUTABLE_PATH } : {}),
		});
	} catch (error) {
		throw new Error(
			`Could not launch Chromium. Run \`pnpm exec playwright install chromium\` or set CHROMIUM_PATH to an installed browser. ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

async function getAgentError(page: Page): Promise<string | null> {
	return page
		.locator('[data-testid="agent-error"]')
		.textContent({ timeout: 100 })
		.catch(() => null);
}

async function waitForMountedText(page: Page, needle: string): Promise<void> {
	await Promise.race([
		page.waitForFunction(
			(expected) => {
				const mount = document.querySelector('[data-testid="prototype-mount"]');
				const host = mount?.firstElementChild as HTMLElement | null;
				return (host?.shadowRoot?.textContent ?? "").includes(expected as string);
			},
			needle,
			{ timeout: TIMEOUT_MS },
		),
		page.waitForSelector('[data-testid="agent-error"]', { timeout: TIMEOUT_MS }),
	]);

	const error = await getAgentError(page);
	if (error) {
		throw new Error(error);
	}
}

async function getMountedText(page: Page): Promise<string> {
	return page.evaluate(() => {
		const mount = document.querySelector('[data-testid="prototype-mount"]');
		const host = mount?.firstElementChild as HTMLElement | null;
		return (host?.shadowRoot?.textContent ?? "").replace(/\s+/g, " ").trim();
	});
}

async function captureAnchor(page: Page, needle: string): Promise<CapturedAnchor> {
	return page.evaluate(async (expected) => {
		const load = (url: string) => import(/* @vite-ignore */ url);
		const anchoring = await load("/src/anchoring/index.ts");
		const mount = document.querySelector('[data-testid="prototype-mount"]');
		const host = mount?.firstElementChild as HTMLElement | null;
		const root = host?.shadowRoot;
		if (!root) throw new Error("prototype shadow root is not mounted");

		const text = (element: Element | null) =>
			element ? (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100) : null;

		const candidates = [...root.querySelectorAll("*")].filter((element) => text(element)?.includes(expected as string));
		const element = candidates[candidates.length - 1];
		if (!element) throw new Error(`no prototype element contains "${expected}"`);

		const rect = element.getBoundingClientRect();
		const hostRect = (root.host as HTMLElement).getBoundingClientRect();
		const position = {
			x: (rect.left + rect.width / 2 - hostRect.left) / hostRect.width,
			y: (rect.top + rect.height / 2 - hostRect.top) / hostRect.height,
		};

		return {
			capturedText: text(element) ?? "",
			signals: anchoring.captureAnchor(element, position, root),
		};
	}, needle);
}

async function resolveAnchor(page: Page, signals: unknown): Promise<Resolution> {
	return page.evaluate(async (capturedSignals) => {
		const load = (url: string) => import(/* @vite-ignore */ url);
		const anchoring = await load("/src/anchoring/index.ts");
		const mount = document.querySelector('[data-testid="prototype-mount"]');
		const host = mount?.firstElementChild as HTMLElement | null;
		const root = host?.shadowRoot;
		if (!root) throw new Error("prototype shadow root is not mounted");

		const text = (element: Element | null) =>
			element ? (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100) : null;
		const resolution = anchoring.resolveAnchor(capturedSignals, root);

		return {
			status: resolution.status,
			score: resolution.score,
			matched: resolution.matched,
			changed: resolution.changed,
			reason: resolution.reason,
			resolvedText: text(resolution.element),
		};
	}, signals);
}

async function main(): Promise<void> {
	let browser: Browser | undefined;
	try {
		browser = await launchBrowser();
		const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
		const pageErrors: string[] = [];
		const consoleErrors: string[] = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));
		page.on("console", (message) => {
			if (message.type() === "error") consoleErrors.push(message.text());
		});

		await page.goto(URL_UNDER_TEST, { waitUntil: "domcontentloaded" });
		await page.waitForSelector('[data-testid="agent-panel"]', { timeout: 60_000 });

		await page.getByTestId("agent-prompt").fill(GENERATE_PROMPT);
		await page.getByTestId("agent-generate").click();
		await waitForMountedText(page, "Harbor Ops");

		const generatedText = await getMountedText(page);
		record(
			"Generate renders requested prototype",
			generatedText.includes("Harbor Ops") && generatedText.includes("Escalations"),
			generatedText.slice(0, 180),
		);

		const anchor = await captureAnchor(page, "Escalations");
		record(
			"Anchor captured from generated prototype",
			anchor.capturedText.includes("Escalations"),
			`captured "${anchor.capturedText}"`,
		);

		await page.getByTestId("agent-instruction").fill(REWRITE_INSTRUCTION);
		await page.getByTestId("agent-rewrite").click();
		await waitForMountedText(page, "Harbor Ops Live");

		const rewrittenText = await getMountedText(page);
		record(
			"Rewrite updates same prototype",
			rewrittenText.includes("Harbor Ops Live") && rewrittenText.includes("Needs attention"),
			rewrittenText.slice(0, 180),
		);

		const resolution = await resolveAnchor(page, anchor.signals);
		record(
			"Captured anchor survives rewrite",
			resolution.status !== "orphaned" && (resolution.resolvedText ?? "").includes("Escalations"),
			`${resolution.status} (${resolution.score}) → "${resolution.resolvedText}" · matched ${resolution.matched.join(", ") || "none"}`,
		);

		record("no page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | ") || "clean");
		record(
			"no browser console errors",
			consoleErrors.length === 0,
			consoleErrors.slice(0, 2).join(" | ") || "clean",
		);
	} finally {
		await browser?.close();
	}

	const failed = checks.filter((check) => !check.passed);
	console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
	if (failed.length > 0) process.exitCode = 1;
}

await main();