/**
 * Verifies the Drydock ⇄ Blackbird join against a running, patched canvas.
 *
 *   node blackbird-join/apply.ts <blackbird>   # once
 *   (cd <blackbird> && npm run dev)            # in one shell
 *   BB_URL=http://127.0.0.1:5181/ node blackbird-join/verify.ts
 *
 * The claim under test is not "a prototype renders" — the Phase 0 spike already
 * showed that. It is that a tree compiled in the browser satisfies Blackbird's
 * EXISTING package contract well enough to be an ordinary frame: live, on the
 * canvas, talking the live protocol, updating in place.
 */
import { chromium, type Browser, type Page } from "playwright";

const URL_UNDER_TEST = process.env.BB_URL ?? "http://127.0.0.1:5181/";
const EXECUTABLE_PATH = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

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

/** Captures the live-protocol messages frames post to the canvas. */
async function listenForProtocol(page: Page): Promise<void> {
	await page.evaluate(() => {
		const seen: { type: string; sid?: string; route?: string }[] = [];
		(window as unknown as Record<string, unknown>).__protocolSeen = seen;
		window.addEventListener("message", (event: MessageEvent) => {
			const data = event.data;
			if (data && typeof data === "object" && typeof data.type === "string") {
				if (data.type.startsWith("PROTOTYPE_")) {
					seen.push({ type: data.type, sid: data.sid, route: data.route });
				}
			}
		});
	});
}

interface FrameState {
	count: number;
	ids: string[];
	src: string | null;
	/** Text rendered INSIDE the frame document — proof it actually ran. */
	text: string;
	/** A design-system Card's computed background, read across the frame boundary. */
	cardBackground: string | null;
	manifest: unknown;
}

async function readFrames(page: Page): Promise<FrameState> {
	return page.evaluate(async () => {
		const frames = [...document.querySelectorAll("iframe[data-frame-id]")] as HTMLIFrameElement[];
		const drydock = frames.find((f) => (f.getAttribute("src") ?? "").includes("/preview/drydock-"));
		const doc = drydock?.contentDocument ?? null;
		const card = doc?.querySelector("[class*='rounded']") as HTMLElement | null;
		const src = drydock?.getAttribute("src") ?? null;

		let manifest: unknown = null;
		if (src) {
			const base = src.replace(/index\.html$/, "");
			try {
				manifest = await (await fetch(`${base}canvas-manifest.json`)).json();
			} catch {
				manifest = null;
			}
		}

		return {
			count: frames.length,
			ids: frames.map((f) => f.dataset.frameId ?? ""),
			src,
			text: doc?.body?.innerText?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "",
			cardBackground: card && doc ? doc.defaultView!.getComputedStyle(card).backgroundColor : null,
			manifest,
		};
	});
}

async function compileOnce(page: Page): Promise<string> {
	await page.click('[data-testid="drydock-compile"]');
	await page.waitForFunction(
		() => {
			const el = document.querySelector('[data-testid="drydock-detail"]');
			return !!el && (el.textContent ?? "").includes("published");
		},
		undefined,
		{ timeout: 120_000 },
	);
	return (await page.textContent('[data-testid="drydock-detail"]')) ?? "";
}

async function waitForFrameContent(page: Page): Promise<void> {
	await page.waitForFunction(
		() => {
			const frames = [...document.querySelectorAll("iframe[data-frame-id]")] as HTMLIFrameElement[];
			const drydock = frames.find((f) => (f.getAttribute("src") ?? "").includes("/preview/drydock-"));
			return (drydock?.contentDocument?.body?.innerText ?? "").includes("Voice agents");
		},
		undefined,
		{ timeout: 60_000 },
	);
}

async function main(): Promise<void> {
	let browser: Browser | undefined;
	try {
		browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
		const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));

		await page.goto(URL_UNDER_TEST, { waitUntil: "networkidle" });
		await page.waitForSelector('[data-testid="drydock-compile"]', { timeout: 60_000 });
		await listenForProtocol(page);

		const detail = await compileOnce(page);
		await waitForFrameContent(page);
		const first = await readFrames(page);

		record(
			"an in-browser compile becomes a live Blackbird frame",
			first.src !== null && first.text.includes("Voice agents"),
			`${first.src} → "${first.text.slice(0, 70)}…"`,
		);

		record(
			"the package satisfies the canvas-manifest contract",
			(first.manifest as { manifestVersion?: number })?.manifestVersion === 1 &&
				Array.isArray((first.manifest as { screens?: unknown[] })?.screens),
			JSON.stringify(first.manifest).slice(0, 150),
		);

		record(
			"the design system renders inside the frame",
			first.cardBackground !== null && first.cardBackground !== "rgba(0, 0, 0, 0)",
			`a Card's computed background across the frame boundary: ${first.cardBackground}`,
		);

		const protocol = (await page.evaluate(
			() => (window as unknown as Record<string, unknown>).__protocolSeen,
		)) as { type: string; sid?: string }[];
		record(
			"the frame speaks Blackbird's live protocol",
			protocol.some((m) => m.type === "PROTOTYPE_STATE" && m.sid === "agents"),
			protocol.map((m) => `${m.type}${m.sid ? `(${m.sid})` : ""}`).join(", ") || "nothing received",
		);

		// Recompiling must update the SAME frame, not litter the canvas.
		await compileOnce(page);
		await waitForFrameContent(page);
		const second = await readFrames(page);
		record(
			"recompiling updates the frame in place",
			second.count === first.count && second.src !== first.src,
			`frames ${first.count} → ${second.count}; package ${first.src?.slice(9, 28)} → ${second.src?.slice(9, 28)}`,
		);

		record(
			"no page errors during the round trip",
			errors.length === 0,
			errors.length === 0 ? detail.trim() : errors.slice(0, 3).join(" | "),
		);
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
