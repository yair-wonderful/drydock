/**
 * Verifies the join's newest capability: loading a REAL, server-persisted
 * prototype into Blackbird, not just the fixed demo fixtures. The other
 * verify scripts prove the pipe and the anchoring; this one proves the pipe
 * actually connects to what `apps/server` persists, through the same
 * `@drydock/api` client the standalone harness itself uses.
 *
 *   node apps/server/src/main.ts             # apps/server,   in one shell
 *   npm run dev -- --port 5181               # Blackbird,     in another
 *   DRYDOCK_TEST_PROTOTYPE_ID=<id> node blackbird-join/verify-persistence.ts
 *
 * If DRYDOCK_TEST_PROTOTYPE_ID is not set, this creates its own throwaway
 * prototype via the API first (and deletes it afterwards) so the script is
 * runnable standalone.
 */
import { chromium, type Browser, type Page } from "playwright";

const BB_URL = process.env.BB_URL ?? "http://127.0.0.1:5181/";
const API_URL = process.env.DRYDOCK_API_URL ?? "http://127.0.0.1:5299";
const EXECUTABLE_PATH = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const MARKER_TEXT = `blackbird-persistence-check-${Date.now()}`;

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

const createTestPrototype = async (): Promise<string> => {
	const response = await fetch(`${API_URL}/api/prototypes`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			name: "blackbird-join verify-persistence",
			author: "verify-persistence.ts",
			entryPoint: "src/index.tsx",
			files: [
				{
					path: "src/index.tsx",
					contents: `import { Card, Text } from "@wonderful/ui-base"\nexport default function App() {\n  return <Card><Text variant="body">${MARKER_TEXT}</Text></Card>\n}\n`,
				},
			],
		}),
	});
	if (!response.ok) {
		throw new Error(`could not create a test prototype: ${response.status} ${await response.text()}`);
	}
	const body = (await response.json()) as { id: string };
	return body.id;
};

const deleteTestPrototype = async (id: string): Promise<void> => {
	await fetch(`${API_URL}/api/prototypes/${id}`, { method: "DELETE" }).catch(() => {});
};

async function main(): Promise<void> {
	let browser: Browser | undefined;
	const ownPrototypeId = process.env.DRYDOCK_TEST_PROTOTYPE_ID ? null : await createTestPrototype();
	const prototypeId = process.env.DRYDOCK_TEST_PROTOTYPE_ID ?? ownPrototypeId;
	if (!prototypeId) {
		throw new Error("no prototype id");
	}

	try {
		browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
		const page: Page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
		page.on("pageerror", (error) => record("no page errors", false, error.message));

		await page.goto(BB_URL, { waitUntil: "networkidle" });
		await page.waitForSelector('[data-testid="drydock-panel"]', { timeout: 15_000 });

		await page.locator('[data-testid="drydock-prototype-id"]').fill(prototypeId);
		await page.locator('[data-testid="drydock-load"]').click();

		await page.waitForFunction(
			() => document.querySelector('[data-testid="drydock-detail"]')?.textContent?.includes("published"),
			undefined,
			{ timeout: 15_000 },
		);
		const detail = (await page.locator('[data-testid="drydock-detail"]').textContent()) ?? "";
		record("loading a real prototype id publishes a frame", detail.includes("published"), detail);

		// The panel's own "published" status lands before the frame has actually
		// mounted and rendered — verify.ts hits the same gap and polls the
		// frame's own text rather than trusting the status line's timing.
		// Selected by src, same as verify.ts: the canvas can hold other frames,
		// and the first `iframe[data-frame-id]` in DOM order is not guaranteed
		// to be this one.
		await page.waitForFunction(
			(marker) => {
				const frames = [...document.querySelectorAll("iframe[data-frame-id]")] as HTMLIFrameElement[];
				const drydock = frames.find((f) => (f.getAttribute("src") ?? "").includes("/preview/drydock-"));
				return (drydock?.contentDocument?.body?.innerText ?? "").includes(marker as string);
			},
			MARKER_TEXT,
			{ timeout: 60_000 },
		);
		const frameText = await page.evaluate(() => {
			const frames = [...document.querySelectorAll("iframe[data-frame-id]")] as HTMLIFrameElement[];
			const drydock = frames.find((f) => (f.getAttribute("src") ?? "").includes("/preview/drydock-"));
			return drydock?.contentDocument?.body?.innerText ?? null;
		});
		record(
			"the live frame renders the PERSISTED prototype's own content",
			frameText?.includes(MARKER_TEXT) ?? false,
			frameText ? `frame text: "${frameText.slice(0, 120)}"` : "could not read frame content",
		);

		// The fixture buttons must still work — this feature is additive, not a
		// replacement.
		await page.locator('[data-testid="drydock-compile"]').click();
		await page.waitForFunction(
			() => document.querySelector('[data-testid="drydock-detail"]')?.textContent?.includes("published"),
			undefined,
			{ timeout: 15_000 },
		);
		record("the original fixture button still compiles", true, "compiled after loading a persisted prototype");

		// A bad id must fail loudly, not silently render nothing.
		await page.locator('[data-testid="drydock-prototype-id"]').fill("00000000-0000-0000-0000-000000000000");
		await page.locator('[data-testid="drydock-load"]').click();
		await page.waitForFunction(
			() => document.querySelector('[data-testid="drydock-detail"]')?.textContent?.length,
			undefined,
			{ timeout: 15_000 },
		);
		const errorDetail = (await page.locator('[data-testid="drydock-detail"]').textContent()) ?? "";
		record(
			"a missing prototype id reports an error rather than nothing",
			errorDetail.length > 0 && !errorDetail.includes("published"),
			errorDetail,
		);
	} finally {
		await browser?.close();
		if (ownPrototypeId) {
			await deleteTestPrototype(ownPrototypeId);
		}
	}

	const failed = checks.filter((c) => !c.passed);
	console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
	if (failed.length > 0) {
		process.exitCode = 1;
	}
}

await main();
