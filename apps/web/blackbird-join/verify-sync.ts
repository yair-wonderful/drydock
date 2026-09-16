/**
 * Verifies that comment anchors survive Blackbird's MULTIPLAYER sync path.
 *
 *   BB_URL=http://127.0.0.1:5181/ node blackbird-join/verify-sync.ts
 *
 * Starts the canvas's own sync server, joins one session from two independent
 * browser contexts, and checks that an anchor captured by one client reaches
 * the other intact and still resolves there after a rebuild.
 *
 * This exists because the honest answer to "do anchors sync?" was previously
 * "they ride on the comment object, so they should" — and they did not. The
 * server whitelists every field on the wire, and `anchor` was not on the list,
 * so it was silently stripped and the stripped copy broadcast back over each
 * client's optimistic write. Reasoning is not evidence.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";

const CANVAS_URL = process.env.BB_URL ?? "http://127.0.0.1:5181/";
const BLACKBIRD_DIR =
	process.env.BB_DIR ??
	"/tmp/claude-0/-home-user-wonderful/a9521302-482c-56aa-afc4-50fe4f2a7165/scratchpad/bb/one/blackbird-main";
const SYNC_PORT = Number(process.env.BB_SYNC_PORT ?? 4181);
const SESSION = `anchor-sync-${Date.now().toString(36)}`;
const EXECUTABLE_PATH = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

const checks: { name: string; passed: boolean; detail: string }[] = [];

function record(name: string, passed: boolean, detail: string): void {
	checks.push({ name, passed, detail });
	console.log(`${passed ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

async function startSyncServer(): Promise<ChildProcess> {
	const child = spawn("node", ["server/sync-server.mjs"], {
		cwd: BLACKBIRD_DIR,
		env: { ...process.env, PORT: String(SYNC_PORT) },
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stderr?.on("data", (chunk) => console.error(`[sync] ${String(chunk).trim()}`));
	// Wait for it to answer rather than sleeping a guessed interval.
	for (let attempt = 0; attempt < 40; attempt += 1) {
		try {
			const response = await fetch(`http://127.0.0.1:${SYNC_PORT}/api/comments?session=probe`);
			if (response.ok) return child;
		} catch {
			/* not up yet */
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("sync server did not start");
}

function getSessionUrl(name: string): string {
	const url = new URL(CANVAS_URL);
	url.searchParams.set("session", SESSION);
	url.searchParams.set("name", name);
	url.searchParams.set("sync", `http://127.0.0.1:${SYNC_PORT}`);
	return url.toString();
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
			const frame = document.querySelector("iframe[data-frame-id]") as HTMLIFrameElement | null;
			return (frame?.contentDocument?.body?.innerText ?? "").includes("Voice agents");
		},
		undefined,
		{ timeout: 60_000 },
	);
	await page.waitForTimeout(1200);
}

async function pinOn(page: Page, needle: string): Promise<boolean> {
	const point = await page.evaluate((text: string) => {
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
	if (!point) return false;
	await page.keyboard.press("c");
	await page.waitForTimeout(250);
	await page.mouse.click(point.x, point.y);
	await page.waitForTimeout(900);
	const textarea = page.locator("textarea").first();
	await textarea.fill(`Shared comment on ${needle}`);
	await textarea.press("ControlOrMeta+Enter");
	await page.waitForTimeout(900);
	return true;
}

/** The session's comments as the SERVER holds them — past sanitisation. */
async function readServerComments(): Promise<{ body: string; anchor?: Record<string, unknown> }[]> {
	const response = await fetch(
		`http://127.0.0.1:${SYNC_PORT}/api/comments?session=${encodeURIComponent(SESSION)}`,
	);
	const data = (await response.json()) as { comments?: unknown[] };
	return (data.comments ?? []) as { body: string; anchor?: Record<string, unknown> }[];
}

async function readPinTitles(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll("button[title]")]
			.map((el) => el.getAttribute("title") ?? "")
			.filter((title) => /attached|needsReview|orphaned/.test(title)),
	);
}

async function main(): Promise<void> {
	let server: ChildProcess | undefined;
	let browser: Browser | undefined;
	try {
		server = await startSyncServer();
		browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });

		// Two independent contexts: separate storage, separate clients, one session.
		const alice = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
		const bob = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();

		// NOT networkidle: a synced canvas holds its EventSource open, so the
		// network never goes idle and the wait would always time out.
		await alice.goto(getSessionUrl("Alice"), { waitUntil: "domcontentloaded" });
		await alice.waitForSelector('[data-testid="drydock-compile"]', { timeout: 60_000 });
		await compile(alice, "drydock-compile");

		const pinned = await pinOn(alice, "Outbound sales");
		record("Alice pinned a comment in a synced session", pinned, pinned ? "pin placed" : "target not found");

		const onServer = await readServerComments();
		record(
			"the anchor survives the server's field whitelist",
			onServer.length > 0 && !!onServer[0].anchor,
			onServer.length === 0
				? "no comment reached the server"
				: `server holds anchor with keys: ${Object.keys(onServer[0].anchor ?? {}).join(", ") || "(none — stripped)"}`,
		);

		record(
			"the anchor's `unique` flags survive the wire",
			typeof (onServer[0]?.anchor?.text as { unique?: unknown })?.unique === "boolean",
			JSON.stringify((onServer[0]?.anchor as Record<string, unknown>)?.text ?? null),
		);

		// Bob joins the same session and compiles the same prototype. Frame ids are
		// package-derived and therefore identical across clients, which is what
		// lets two people share pins at all.
		await bob.goto(getSessionUrl("Bob"), { waitUntil: "domcontentloaded" });
		await bob.waitForSelector('[data-testid="drydock-compile"]', { timeout: 60_000 });
		await compile(bob, "drydock-compile");
		await bob.waitForTimeout(2000);

		const bobComments = await bob.evaluate(() =>
			[...document.querySelectorAll("button[title]")].map((el) => el.getAttribute("title") ?? ""),
		);
		record(
			"Bob receives Alice's comment",
			bobComments.some((title) => title.includes("#1")),
			bobComments.filter(Boolean).slice(0, 2).join(" | ") || "no pins on Bob's canvas",
		);

		// Bob rebuilds. His client must re-resolve an anchor he never captured.
		await compile(bob, "drydock-rewrite");
		await bob.waitForTimeout(3000);
		const bobTitles = await readPinTitles(bob);
		record(
			"Bob re-resolves an anchor captured by Alice",
			bobTitles.some((title) => /needsReview|attached|orphaned/.test(title)),
			bobTitles[0]?.replace(/\n/g, " · ") ?? "no resolution on Bob's pins",
		);

		record(
			"the renamed row is flagged for Bob too",
			bobTitles.some((title) => title.includes("needsReview")),
			bobTitles.find((t) => t.includes("needsReview"))?.replace(/\n/g, " · ") ?? "not flagged",
		);
	} finally {
		await browser?.close();
		server?.kill();
	}

	const failed = checks.filter((c) => !c.passed);
	console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
	if (failed.length > 0) process.exitCode = 1;
}

await main();
