/**
 * Reports whether `libs/ui` or `libs/theme` have changed in the Wonderful
 * monorepo since the commit pinned in `vendor/SOURCE.json` — the gap
 * `scripts/fetchDesignSystem.ts` leaves open by design (a pin is deliberately
 * static) and that nothing else in this repo was watching.
 *
 * This does not fetch or diff anything from the monorepo itself, which would
 * mean cloning it just to answer a yes/no question. It asks the GitHub REST
 * API "any commits touching this path since I last synced?" for each vendored
 * path, which is exactly the question a developer actually has.
 *
 *   pnpm run check:design-system          # informational; exits 0 regardless
 *   pnpm run check:design-system --strict # exits 1 if stale, for CI
 *
 * Auth: GITHUB_TOKEN or GH_TOKEN if set, else `gh auth token` if the gh CLI is
 * configured, else unauthenticated (works for a public repo; a private one
 * reports that it could not check rather than guessing).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_JSON_PATH = join(ROOT, "vendor", "SOURCE.json");

type Source = {
	repository: string;
	commit: string;
	paths: string[];
	packages: string[];
	fetchedAt: string;
};

type Commit = {
	sha: string;
	commit: { message: string; author: { date: string } };
	html_url: string;
};

const getSource = (): Source => JSON.parse(readFileSync(SOURCE_JSON_PATH, "utf8")) as Source;

/** Parses `https://github.com/<owner>/<repo>.git` into its two path segments. */
const getOwnerAndRepo = (repositoryUrl: string): { owner: string; repo: string } => {
	const match = repositoryUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (!match) {
		throw new Error(`could not parse a GitHub owner/repo out of "${repositoryUrl}"`);
	}
	return { owner: match[1], repo: match[2] };
};

const getGhCliToken = (): string | null => {
	try {
		return execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return null;
	}
};

const getAuthToken = (): string | null =>
	process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? getGhCliToken();

/**
 * Commits touching `path` on the default branch since `since`, newest first.
 * Capped at 10 — enough to show what changed without the report turning into
 * a changelog when a path has moved a lot.
 */
const getCommitsSince = async (
	owner: string,
	repo: string,
	path: string,
	since: string,
	token: string | null,
): Promise<Commit[]> => {
	const url = new URL(`https://api.github.com/repos/${owner}/${repo}/commits`);
	url.searchParams.set("path", path);
	url.searchParams.set("since", since);
	url.searchParams.set("per_page", "10");

	const response = await fetch(url, {
		headers: {
			accept: "application/vnd.github+json",
			"user-agent": "drydock-design-system-staleness-check",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
	});

	if (!response.ok) {
		const reason =
			response.status === 401 || response.status === 404
				? "no access — set GITHUB_TOKEN or run `gh auth login`, then retry"
				: response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0"
					? "rate limited — unauthenticated requests are capped at 60/hour; set GITHUB_TOKEN to raise it"
					: `GitHub API returned ${response.status}`;
		throw new Error(reason);
	}

	return (await response.json()) as Commit[];
};

const getDaysSince = (iso: string): number => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

const main = async (): Promise<void> => {
	const strict = process.argv.includes("--strict");

	if (!existsSync(SOURCE_JSON_PATH)) {
		// The normal state of a fresh clone, before `sync:design-system` has ever
		// run — nothing to compare against yet, not a broken check.
		console.log("No vendor/SOURCE.json yet — run `pnpm run sync:design-system` first.");
		return;
	}
	const source = getSource();
	const { owner, repo } = getOwnerAndRepo(source.repository);
	const daysSinceSync = getDaysSince(source.fetchedAt);

	console.log(
		`Design system pinned at ${source.commit.slice(0, 12)}, synced ${daysSinceSync} day(s) ago (${source.fetchedAt}).`,
	);
	console.log(`Checking ${owner}/${repo} for changes to ${source.paths.join(", ")} since then...\n`);

	const token = getAuthToken();
	let anyStale = false;
	let checkFailed = false;

	for (const path of source.paths) {
		try {
			const commits = await getCommitsSince(owner, repo, path, source.fetchedAt, token);
			if (commits.length === 0) {
				console.log(`  ${path}: up to date`);
				continue;
			}
			anyStale = true;
			console.log(`  ${path}: ${commits.length}+ commit(s) since sync`);
			for (const c of commits.slice(0, 5)) {
				const subject = c.commit.message.split("\n")[0];
				console.log(`    ${c.sha.slice(0, 7)}  ${subject}`);
			}
		} catch (error) {
			checkFailed = true;
			console.log(`  ${path}: could not check (${(error as Error).message})`);
		}
	}

	console.log();
	if (checkFailed && !anyStale) {
		console.log(`Could not fully verify. Last known-good sync was ${daysSinceSync} day(s) ago.`);
		// In CI, an unverifiable check must not read as a passing one — that
		// would make the exact moment GitHub is unreachable the moment this gate
		// goes quiet. A local, unauthenticated `pnpm run check:design-system`
		// stays exit-0 so it can be run freely as a nudge.
		if (strict) {
			process.exitCode = 1;
		}
		return;
	}
	if (anyStale) {
		console.log("STALE — run `pnpm run sync:design-system` to pull the latest, then re-run `pnpm run verify`.");
		if (strict) {
			process.exitCode = 1;
		}
		return;
	}
	console.log("Up to date.");
};

await main();
