/**
 * Verifies comment anchoring across a rewrite.
 *
 *   pnpm run dev            # in one shell
 *   node scripts/verify-anchoring.ts
 *
 * Drives the REAL modules in a real browser: compile v1, pin three comments,
 * compile the rewritten v2, re-resolve. The claim is not "anchors work" but the
 * specific one that matters — a comment is either confidently reattached, or
 * flagged, or declared lost, and never silently re-aimed at a plausible
 * replacement.
 */
import { chromium, type Browser } from "playwright";

const URL_UNDER_TEST = process.env.SPIKE_URL ?? "http://127.0.0.1:5199/";
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

interface PinResult {
	label: string;
	capturedText: string;
	sourceUnique: boolean;
	status: string;
	reason: string;
	matched: string[];
	changed: string[];
	resolvedText: string | null;
	/** What a POSITIONAL anchor would have pointed at after the rewrite. */
	positionalText: string | null;
}

async function main(): Promise<void> {
	let browser: Browser | undefined;
	try {
		browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
		const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));

		await page.goto(URL_UNDER_TEST, { waitUntil: "networkidle" });
		// Wait for the app's OWN mount before driving our own. It is what installs
		// the shared-dependency import map, and an import map has to be in the
		// document before any module that resolves through it is fetched.
		await page.waitForFunction(
			() => {
				const mount = document.querySelector('[data-testid="prototype-mount"]');
				const host = mount?.firstElementChild as HTMLElement | null;
				return (host?.shadowRoot?.textContent?.length ?? 0) > 0;
			},
			undefined,
			{ timeout: 60_000 },
		);

		const results = (await page.evaluate(async () => {
			// Imported by URL through a variable so this file's own typecheck does
			// not try to resolve dev-server paths. These are the SAME module
			// instances the app is using — same URL, same singleton — so the
			// stylesheet the app already set is the one the engine reads.
			const load = (url: string) => import(/* @vite-ignore */ url);
			const drydock = await load("/src/drydock/index.ts");
			const anchoring = await load("/src/anchoring/index.ts");
			const v1 = (await load("/src/fixtures/prototypeTree.ts")).default;
			const v2 = (await load("/src/fixtures/rewrittenTree.ts")).default;

			/** Mounts a tree into a detached host and returns its shadow root. */
			async function mount(tree: Record<string, string>): Promise<ShadowRoot> {
				const container = document.createElement("div");
				container.style.cssText = "position:fixed;left:-99999px;width:1280px;height:900px;";
				document.body.appendChild(container);
				const compiled = await drydock.compileTree(tree);
				if (!compiled.code) {
					throw new Error(`compile failed: ${compiled.errors.map((e: { text: string }) => e.text).join("; ")}`);
				}
				const mounted = await drydock.mountPrototype({
					container,
					code: compiled.code,
					sourceMap: compiled.sourceMap,
					mode: "light",
					onRuntimeError: () => {},
				});
				await new Promise((resolve) => setTimeout(resolve, 400));
				return mounted.shadowRoot;
			}

			const text = (el: Element | null) =>
				el ? (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60) : null;

			const before = await mount(v1);

			// Pick three real targets by their visible text, the way a person would.
			function findByText(root: ParentNode, needle: string): Element {
				const all = [...root.querySelectorAll("*")];
				// The DEEPEST element whose text starts with the needle — i.e. the row
				// itself rather than every ancestor that contains it.
				const matches = all.filter((el) => text(el)?.startsWith(needle));
				const found = matches[matches.length - 1];
				if (!found) throw new Error(`no element for "${needle}"`);
				return found;
			}

			const targets = [
				{ label: "a card that MOVES (Median latency)", needle: "Median latency" },
				{ label: "a row that is RENAMED (Outbound sales)", needle: "Outbound sales" },
				{ label: "a row that is REMOVED (After-hours triage)", needle: "After-hours triage" },
			];

			const pins = targets.map((target) => {
				const element = findByText(before, target.needle);
				const rect = element.getBoundingClientRect();
				const hostRect = (before.host as HTMLElement).getBoundingClientRect();
				const position = {
					x: (rect.left + rect.width / 2 - hostRect.left) / hostRect.width,
					y: (rect.top + rect.height / 2 - hostRect.top) / hostRect.height,
				};
				return {
					label: target.label,
					signals: anchoring.captureAnchor(element, position),
					capturedText: text(element) ?? "",
				};
			});

			const after = await mount(v2);
			const afterHostRect = (after.host as HTMLElement).getBoundingClientRect();

			return pins.map((pin) => {
				const resolution = anchoring.resolveAnchor(pin.signals, after);
				// What a purely positional pin would now be pointing at.
				const px = afterHostRect.left + pin.signals.position.x * afterHostRect.width;
				const py = afterHostRect.top + pin.signals.position.y * afterHostRect.height;
				// Geometry, not hit-testing: the mount is off-screen, where
				// elementFromPoint returns nothing but getBoundingClientRect is
				// still exact. The deepest element containing the point is what a
				// positional pin would have landed on.
				const under =
					[...after.querySelectorAll("*")]
						.filter((el) => {
							const r = el.getBoundingClientRect();
							return r.width > 0 && r.height > 0 && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
						})
						.pop() ?? null;
				return {
					label: pin.label,
					capturedText: pin.capturedText,
					sourceUnique: pin.signals.source?.unique ?? false,
					status: resolution.status,
					reason: resolution.reason,
					matched: resolution.matched,
					changed: resolution.changed,
					resolvedText: text(resolution.element),
					positionalText: text(under),
				};
			});
		})) as PinResult[];

		const [moved, renamed, removed] = results;

		record(
			"a moved element stays ATTACHED",
			moved.status === "attached" && (moved.resolvedText ?? "").includes("Median latency"),
			`${moved.status} → "${moved.resolvedText}" · matched ${moved.matched.join(", ")}`,
		);

		record(
			"a renamed element is flagged NEEDS REVIEW, not silently kept",
			renamed.status === "needsReview",
			`${renamed.status} · ${renamed.reason}`,
		);

		record(
			"a removed element is declared ORPHANED, not re-aimed",
			removed.status === "orphaned" && removed.resolvedText === null,
			`${removed.status} · ${removed.reason}`,
		);

		// The whole point, stated as a test: the positional anchor these replace
		// would have pointed somewhere confidently wrong.
		const positionalWrong = results.filter(
			(pin) => pin.positionalText !== null && !pin.positionalText.includes(pin.capturedText.slice(0, 18)),
		);
		record(
			"a positional pin would have been silently wrong",
			positionalWrong.length > 0,
			positionalWrong
				.map((p) => `"${p.capturedText.slice(0, 24)}…" → would now point at "${p.positionalText?.slice(0, 32)}…"`)
				.join("; ") || "no positional drift observed",
		);

		record(
			"no element is ever resolved without evidence",
			results.every((pin) => pin.status !== "attached" || pin.matched.length > 0),
			results.map((p) => `${p.status}(${p.matched.length} signals)`).join(", "),
		);

		record("no page errors", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");
	} finally {
		await browser?.close();
	}

	const failed = checks.filter((check) => !check.passed);
	console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
	if (failed.length > 0) process.exitCode = 1;
}

await main();
