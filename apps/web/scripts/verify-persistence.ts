/**
 * End-to-end verification of the persistence wiring added on top of the
 * Phase 0 spike: create a prototype through the real UI, reload the page, and
 * confirm the editor rehydrates from the server rather than from memory.
 *
 *   pnpm run dev          # apps/web,    in one shell
 *   node --env-file-if-exists=.env src/main.ts   # apps/server, in another
 *   pnpm run verify:persistence
 *
 * Chromium comes from PLAYWRIGHT_BROWSERS_PATH when the pinned Playwright
 * build is not the one installed locally.
 */
import { chromium, type Browser, type Page } from "playwright";

const APP_URL = process.env.SPIKE_URL ?? "http://127.0.0.1:5199/";
const API_URL = process.env.DRYDOCK_API_URL ?? "http://127.0.0.1:5299";
const EXECUTABLE_PATH = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const AUTHOR = "verify-persistence bot";

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

async function waitForSaveStatus(page: Page, expected: string): Promise<string> {
	await page.waitForFunction(
		(text) => document.querySelector(".save-status")?.textContent === text,
		expected,
		{ timeout: 10_000 },
	);
	return (await page.locator(".save-status").textContent()) ?? "";
}

async function main(): Promise<void> {
	let browser: Browser | undefined;
	let prototypeId: string | null = null;

	try {
		browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
		const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

		// `getAuthor()` blocks on `window.prompt` the first time this browser
		// profile saves anything. A fresh Playwright context has no
		// localStorage, so this fires on the very first Save click.
		page.on("dialog", (dialog) => void dialog.accept(AUTHOR));

		const testName = `verify-persistence ${Date.now()}`;

		await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
		await page.waitForSelector('[aria-label="Prototype name"]', { timeout: 15_000 });

		const nameInput = page.locator('[aria-label="Prototype name"]');
		await nameInput.fill(testName);

		// The entry point, not whatever tab happens to be active by default: on
		// reload the app switches focus to HARNESS_ENTRY_POINT (see App.tsx's
		// hydration effect), so editing and later re-checking that same file is
		// what makes the reload assertion below test the real round trip rather
		// than an incidental mismatch between "the file I edited" and "the file
		// the app shows after loading a saved prototype".
		await page.locator(".tabs .tab", { hasText: "index.tsx" }).click();

		const marker = `verify-persistence-marker-${Date.now()}`;
		const editor = page.locator('[data-testid="file-source"]');
		const originalSource = await editor.inputValue();
		await editor.fill(`${originalSource}\n// ${marker}`);

		await page.locator("button", { hasText: "Save" }).first().click();
		const firstStatus = await waitForSaveStatus(page, "saved · v1");
		record("first save creates v1", firstStatus === "saved · v1", `status: "${firstStatus}"`);

		const url = new URL(page.url());
		prototypeId = url.searchParams.get("prototype");
		record(
			"save writes the prototype id into the URL",
			prototypeId !== null,
			`url: ${page.url()}`,
		);

		if (prototypeId) {
			const apiResponse = await fetch(`${API_URL}/api/prototypes/${prototypeId}`);
			const apiBody = (await apiResponse.json()) as {
				name: string;
				activeVersion: { versionNumber: number; files: { path: string; contents: string }[] } | null;
			};
			record(
				"server has the prototype under the name typed in the UI",
				apiResponse.ok && apiBody.name === testName,
				`GET ${apiResponse.status}, name: "${apiBody.name}"`,
			);
			const storedSource = apiBody.activeVersion?.files.find((f) => f.contents.includes(marker));
			record(
				"the saved version's source contains the edit made in the browser",
				storedSource !== undefined,
				storedSource ? `found in ${storedSource.path}` : "marker not found in any stored file",
			);
		}

		// Reload at the URL Save just wrote — the actual "survives a reload"
		// claim, exercised through the browser rather than inferred from the API.
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.waitForSelector('[aria-label="Prototype name"]', { timeout: 15_000 });
		await page.waitForFunction(
			() => !document.querySelector(".app-loading"),
			undefined,
			{ timeout: 15_000 },
		);

		const nameAfterReload = await nameInput.inputValue();
		record(
			"name field rehydrates from the server after a reload",
			nameAfterReload === testName,
			`expected "${testName}", got "${nameAfterReload}"`,
		);

		const sourceAfterReload = await editor.inputValue();
		record(
			"editor content rehydrates from the server after a reload",
			sourceAfterReload.includes(marker),
			sourceAfterReload.includes(marker) ? "marker present" : "marker missing",
		);

		// A second save on the now-persisted prototype must publish v2, not
		// create a second prototype.
		await editor.fill(`${sourceAfterReload}\n// second-edit-${Date.now()}`);
		await page.locator("button", { hasText: "Save" }).first().click();
		const secondStatus = await waitForSaveStatus(page, "saved · v2");
		record(
			"editing after reload publishes v2 on the SAME prototype",
			secondStatus === "saved · v2",
			`status: "${secondStatus}"`,
		);

		const urlAfterSecondSave = new URL(page.url());
		record(
			"the prototype id in the URL is unchanged across the second save",
			urlAfterSecondSave.searchParams.get("prototype") === prototypeId,
			`before: ${prototypeId}, after: ${urlAfterSecondSave.searchParams.get("prototype")}`,
		);
	} finally {
		await browser?.close();
		if (prototypeId) {
			// Test cleanup, not part of the claim under test.
			await fetch(`${API_URL}/api/prototypes/${prototypeId}`, { method: "DELETE" }).catch(() => {});
		}
	}

	const failed = checks.filter((c) => !c.passed);
	console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
	if (failed.length > 0) {
		process.exitCode = 1;
	}
}

await main();
