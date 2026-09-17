/**
 * Packages the Wonderful Design Guardrails for a team building Drydock
 * (or anything like it) outside this repository.
 *
 * WHY A SCRIPT RATHER THAN A WRITTEN-ONCE FOLDER. The guardrails live in
 * this repo as TypeScript prompt fragments and mechanical checks, coupled
 * to Drydock's own architecture. A team re-implementing them needs the
 * content and the reasoning, not these modules — but a hand-copied bundle
 * starts drifting from the code the day after it is written. Everything
 * below is generated from the modules that actually run, so the package is
 * reproducible and always matches what this repo enforces.
 *
 * Run: node scripts/exportGuardrails.ts [outDir]
 */

import { mkdirSync, writeFileSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AGENTIC_UX_PROMPT } from "../apps/server/src/agent/agenticUxGuardrails.ts";
import {
	ALL_CRITIQUE_DIMENSIONS,
	CRITIQUE_DIMENSIONS_BY_LENS,
	CRITIQUE_PROMPT,
} from "../apps/server/src/agent/designCritique.ts";
import { DESIGN_GUARDRAILS_PROMPT, GUARDRAIL_CATALOGUE } from "../apps/server/src/agent/designGuardrails.ts";
import { DESIGN_REVIEW_CORPUS, getClusterCounts } from "../apps/server/src/agent/designReviewCorpus.ts";
import { SYSTEM_PROMPT } from "../apps/server/src/agent/systemPrompt.ts";
import { UX_FOUNDATIONS_PROMPT } from "../apps/server/src/agent/uxFoundations.ts";
import { UX_REVIEW_DISCIPLINE, UX_REVIEW_DISCIPLINE_PROMPT } from "../apps/server/src/agent/uxReviewDiscipline.ts";
import { VISUAL_DESIGN_PROMPT } from "../apps/server/src/agent/visualDesignPrinciples.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = resolve(REPO_ROOT, "dist", "wonderful-design-guardrails");

const writeFile = (outDir: string, relativePath: string, contents: string): void => {
	const target = join(outDir, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, contents.endsWith("\n") ? contents : `${contents}\n`);
};

const getSkillEntryPoint = (): string => `---
name: wonderful-design-guardrails
description: Generate or review a Wonderful platform screen so it reads as an actual Wonderful product — agent traceability, the visual canon, mechanical gates, and a structured self-critique. Use when building, reviewing, or prompting an AI tool that produces Wonderful UI.
---

# Wonderful Design Guardrails

What makes a generated screen read as an actual Wonderful product rather
than a generic SaaS mock, expressed so a tool can enforce it.

This package was extracted from Drydock, an internal AI-prototyping tool.
It is generated from the code that runs there, so everything here is
something that is actually enforced or actually sent to a model — not a
description of an intention.

## The thing to understand first

Almost every Wonderful screen shows something an **agent** did, to a human
who has to decide whether to trust it. Wonderful's own framing is a shift
from *user-as-operator* to *user-as-manager*. The load-bearing rule:

> Never present an agent's conclusion without a visible, accessible path
> back to its premise.

Getting spacing right on a screen that hides an agent's reasoning is a
well-made prototype of the wrong product. That is why the agentic layer
comes **before** the visual canon in the prompt below, not after.

## Two enforcement layers, on purpose

**Hard gates** are objective and block generation. They are compatibility
rules, not design opinions: getting one wrong is not a judgement call, it
is broken. See \`reference/hard-gates.md\` and \`data/hard-gates.json\`.

**The rubric and critique** are subjective and shown, never enforced.
They exist so a reviewer has something concrete to check against.

**A rubric item is promoted to a gate only when it is BOTH mechanically
checkable AND already treated as non-negotiable by the organisation.**
Never promote an aesthetic judgement call. The audience this exists to
unblock is already blocked by one human bottleneck; a gate that gets a
subjective call wrong just relocates that bottleneck into the tool.

## The single most important finding

A Wonderful designer reviewed four real screens and left 31 comment pins
(34 remarks). **None of the mechanical gates would have caught any of
them.** Production code already imports the right components and uses the
right tokens — it passes every gate. Every defect found was composition
and calibration.

Two consequences, and they should shape whatever you build:

1. **The gate layer is close to its useful limit.** Leverage is in the
   prompt and in review, not in more regexes. Every corpus finding carries
   a \`mechanicallyCheckable\` flag; all are currently \`false\`.
2. **Four of the pins are on the *reference* frames** — the screens the
   design team holds up as good. There is no clean exemplar, so a system
   built by imitating Wonderful's best screens inherits their defects
   along with their virtues. Teach the reviewer's eye, not a canonical
   screen.

## What is here

| Path | |
|---|---|
| \`prompt/system-prompt.md\` | The full assembled generation prompt, ready to use |
| \`prompt/sections/\` | The same prompt split into its layers, to recombine |
| \`reference/hard-gates.md\` | Every gate, what it checks, why it blocks, what was verified first |
| \`reference/ux-review-discipline.md\` | The stripped, Wonderful-only review discipline distilled from uploaded UX review skills |
| \`reference/review-corpus.md\` | The 34 real review remarks, grouped by cluster |
| \`reference/rationale.md\` | The full design document, including every unresolved conflict |
| \`data/hard-gates.json\` | The gates as data, for re-implementation |
| \`data/ux-review-discipline.json\` | The review discipline as data, for re-implementation |
| \`data/review-corpus.json\` | The corpus as data, for use as an eval set |
| \`data/critique-dimensions.json\` | The 21 critique dimensions |

## How to use it

**Building a generator:** use \`prompt/system-prompt.md\` as the system
prompt, implement the gates from \`data/hard-gates.json\`, and require the
review artifact described in \`reference/hard-gates.md\`. Feed a gate
failure back to the model with the specific violation and retry once
before failing hard.

**Reviewing screens:** use the critique dimensions and the corpus. The
corpus is the closest thing to a labelled dataset of what Wonderful
rejects. Use \`reference/ux-review-discipline.md\` for the broader review
moves that should stay advisory rather than becoming hard gates.

**Read \`reference/rationale.md\` before changing anything here.** It
records which rules were rejected and why, including rules from internal
documents that contradicted verified behaviour. Those decisions are easy
to accidentally undo.
`;

const getHardGatesDoc = (): string => {
	const rows = GUARDRAIL_CATALOGUE.map((entry) => {
		const verification = entry.verification ? `\n  - *Verified:* ${entry.verification}` : "";
		return `### \`${entry.rule}\`\n\n- **Checks:** ${entry.checks}\n- **Why it blocks:** ${entry.rationale}${verification}`;
	}).join("\n\n");

	return `# Hard gates

Mechanically checked after generation. A violation fails the generation,
with the specific failure fed back to the model for one corrective retry,
then a hard failure.

These are all regex and string heuristics over raw source, not an AST.
Where a plain-text check genuinely cannot tell, they **under-report rather
than over-report** — for a gate that BLOCKS, a false negative is safer
than a false positive.

## Three layers catch different things

1. **Generation time** (the gates below) — cheap, generic mistakes, checked
   without a parser or a copy of the design system.
2. **Compile time** — the authoritative check for whether a component or
   utility class *actually exists* in the design system. It rejects an
   unknown Tailwind utility and fails to resolve an invented component
   export. Nothing below duplicates this.
3. **Tree validation** — a valid entry point and valid relative paths,
   before anything is stored.

Layer 2 is worth calling out: "Is this a thing?", "Do we have a component
for that?" and "deprecated style" are five of the 34 real review remarks.
A compiler answers those mechanically, on every generation, before a human
looks. That is a structural advantage over a hand-built screen.

## The gates

${rows}

## The review artifact

Every generation must also return a \`review\` object. It is shown to
whoever reads the prototype and is **never graded against the model** —
that is what makes honest self-reporting possible.

- \`purpose\` — what this screen is for, one sentence.
- \`primaryAction\` — the one main thing a viewer is meant to do.
- \`componentsUsed\` — the design-system components actually used.
- \`mockData\` — what is mocked and how.
- \`knownGaps\` — what is intentionally not wired for real.
- \`rubric.contrastLadder\` / \`spacingRhythm\` / \`affordanceClarity\` /
  \`containerDepth\` / \`componentProvenance\` — \`strong\` | \`medium\` |
  \`weak\`. These five axes are the clusters a Wonderful reviewer actually
  flags, so a weak rating points at a part of the screen. The axes they
  replaced ("wonderful fit", "handoff readiness") were too abstract to act
  on.
- \`rubric.agentLineage\` — prose. Where a reader goes to see *why* an
  agent concluded what it concluded. "No agent output on this screen" is a
  valid answer, which is why it is prose and not a rating.
- \`rubric.stateCoverage\` — prose. Which of loading / empty / error /
  success / disabled / needs-attention are covered.
- \`rubric.critique\` — the structured self-critique. See
  \`data/critique-dimensions.json\`. **Findings only, never a matrix:** a
  model told to rate twenty dimensions pads nineteen of them.
`;
};

const getUxReviewDisciplineDoc = (): string => {
	const sections = UX_REVIEW_DISCIPLINE.map((area) => {
		const checks = area.checks.map((check) => `- ${check}`).join("\n");
		return `### ${area.name}\n\n${checks}`;
	}).join("\n\n");

	return `# UX review discipline

This is the stripped, Wonderful-only material distilled from uploaded UX
review skills. The source skills contained source-process instructions and
non-Wonderful product context that do not belong in Drydock. What remains
here is the reusable review method.

These checks are **advisory, not blocking**. They should influence the
generation prompt, the design self-review, and human review. They should not
be promoted to hard gates unless a future item becomes both mechanically
checkable and repeatedly non-negotiable in Wonderful review evidence.

${sections}
`;
};

const getCorpusDoc = (): string => {
	const counts = getClusterCounts();
	const ranked = Object.entries(counts).sort(([, a], [, b]) => b - a);

	const sections = ranked
		.map(([cluster, count]) => {
			const items = DESIGN_REVIEW_CORPUS.filter((finding) => finding.cluster === cluster)
				.map(
					(finding) =>
						`- **"${finding.quote}"** — ${finding.surface}${finding.isReference ? " *(on a reference frame)*" : ""}`,
				)
				.join("\n");
			return `### ${cluster} (${count})\n\n${items}`;
		})
		.join("\n\n");

	return `# The review corpus

31 comment pins carrying 34 remarks, left by a Wonderful designer on four
real screens in a design review file. Each screen appears twice: a
reference frame the design team considers good, and the same screen as it
ships in production.

Transcribed verbatim, typos included — paraphrasing a one-line design note
sands the edge off it.

**Read the two findings in \`SKILL.md\` before using this.** In short: none
of the mechanical gates would have caught any of these, and four of the
pins are on the *good* reference frames.

## A note on the contrast cluster

It is the largest, and it **cuts both ways** — an icon too dark sitting
next to a placeholder too light, in the same field. The rule is not "go
darker". It is that every element sits at one correct weight and that
siblings inside a single control agree with each other.

This also means it is **not a WCAG check.** A placeholder can pass AA and
still be wrong here.

## A note on \`unsettled\`

Those are open questions in the reviewer's own voice, not decided rules.
They are kept because the frequency of a question is itself signal, but
nothing derived from this corpus should turn one into an assertion.
Encoding an argument that has not finished is how a tool starts losing
arguments on people's behalf.

## The remarks

${sections}
`;
};

const main = (): void => {
	const outDir = resolve(process.argv[2] ?? DEFAULT_OUT_DIR);
	if (outDir === DEFAULT_OUT_DIR) {
		rmSync(outDir, { recursive: true, force: true });
	}
	mkdirSync(outDir, { recursive: true });

	writeFile(outDir, "SKILL.md", getSkillEntryPoint());
	writeFile(outDir, "reference/hard-gates.md", getHardGatesDoc());
	writeFile(outDir, "reference/ux-review-discipline.md", getUxReviewDisciplineDoc());
	writeFile(outDir, "reference/review-corpus.md", getCorpusDoc());

	writeFile(outDir, "prompt/system-prompt.md", SYSTEM_PROMPT);
	writeFile(outDir, "prompt/sections/01-agentic-ux.md", AGENTIC_UX_PROMPT);
	writeFile(outDir, "prompt/sections/02-ux-foundations.md", UX_FOUNDATIONS_PROMPT);
	writeFile(outDir, "prompt/sections/03-visual-canon.md", VISUAL_DESIGN_PROMPT);
	writeFile(outDir, "prompt/sections/04-gates-and-rubric.md", DESIGN_GUARDRAILS_PROMPT);
	writeFile(outDir, "prompt/sections/05-ux-review-discipline.md", UX_REVIEW_DISCIPLINE_PROMPT);
	writeFile(outDir, "prompt/sections/06-critique.md", CRITIQUE_PROMPT);

	writeFile(outDir, "data/hard-gates.json", JSON.stringify(GUARDRAIL_CATALOGUE, null, 2));
	writeFile(outDir, "data/ux-review-discipline.json", JSON.stringify(UX_REVIEW_DISCIPLINE, null, 2));
	writeFile(
		outDir,
		"data/review-corpus.json",
		JSON.stringify(
			{
				remarks: DESIGN_REVIEW_CORPUS.length,
				pins: 31,
				clusterCounts: getClusterCounts(),
				mechanicallyCheckable: DESIGN_REVIEW_CORPUS.filter((f) => f.mechanicallyCheckable).length,
				referenceFrameFindings: DESIGN_REVIEW_CORPUS.filter((f) => f.isReference).length,
				findings: DESIGN_REVIEW_CORPUS,
			},
			null,
			2,
		),
	);
	writeFile(
		outDir,
		"data/critique-dimensions.json",
		JSON.stringify({ byLens: CRITIQUE_DIMENSIONS_BY_LENS, all: ALL_CRITIQUE_DIMENSIONS }, null, 2),
	);

	// Copied rather than regenerated: this is the full reasoning, including
	// every conflict and gap, and it is maintained as prose.
	const rationaleSource = join(REPO_ROOT, "docs", "wonderful-design-guardrails.md");
	if (!existsSync(rationaleSource)) {
		throw new Error(`missing ${rationaleSource} — the package is not worth shipping without the rationale`);
	}
	mkdirSync(join(outDir, "reference"), { recursive: true });
	copyFileSync(rationaleSource, join(outDir, "reference", "rationale.md"));

	console.log(`Exported to ${outDir}`);
	console.log(`  gates:               ${GUARDRAIL_CATALOGUE.length}`);
	console.log(`  corpus remarks:      ${DESIGN_REVIEW_CORPUS.length}`);
	console.log(`  review areas:        ${UX_REVIEW_DISCIPLINE.length}`);
	console.log(`  critique dimensions: ${ALL_CRITIQUE_DIMENSIONS.length}`);
	console.log(`  system prompt:       ${SYSTEM_PROMPT.length} chars (~${Math.round(SYSTEM_PROMPT.length / 4)} tokens)`);
};

main();
