# Wonderful Design Guardrails v0

Drydock's first audience is engineers and PMs on Wonderful's own
platform/core-product R&D teams, generating internal-tool and product
screens fast enough to unblock a design discussion — and, when the idea
holds up, to hand to engineering as the actual starting point for a real
build. That second half is the whole reason this document exists: a
prototype that only needs to *look* plausible is a much lower bar than one
that needs to survive becoming production code.

The Stripe/Harbor lesson this encodes: a model that merely "uses the real
component library" produces something that compiles but doesn't
necessarily read as *your* product. It only becomes genuinely useful once
the organization's own standards — not just its components — are encoded
into the tool. This document is that encoding for Wonderful.

## Two layers, on purpose

**Hard gates** are objective and enforced now — a violation fails
generation immediately, with the specific failure fed back to the model
for one corrective retry (see `apps/server/src/agent/generateTree.ts`).
These are compatibility rules, not design opinions: getting one wrong
isn't a judgment call, it's broken.

**The rubric** is subjective and shown, not enforced — attached to every
generation as a `review` object (see `packages/prototype/src/types.ts`'s
`DesignReview`), visible in the harness UI, never blocking. It exists so a
reviewer has something concrete to check the work against, and so failure
patterns can accumulate before any of them earns promotion to a gate.

**A rubric item is promoted to a gate only once it is both (a) genuinely
mechanically checkable, and (b) actually the thing people keep failing in
ways that break the production-handoff promise.** Never promote a purely
aesthetic judgment call — there is no mechanical check for "does this feel
right" that won't also block legitimate work, and the audience this tool
exists to unblock is already blocked by one human bottleneck; a gate that
gets a subjective call wrong just relocates that bottleneck into the tool.

## Where enforcement actually lives

Two independent layers catch different things, and neither duplicates the
other:

1. **Generation time, in `apps/server`** (`designGuardrails.ts`) — cheap,
   generic mistakes checked by regex/string heuristics over the raw source:
   an import from outside the allowlist, inline styles, a real network
   call, an unlabeled input, an icon-only control with no label, mock data
   inlined instead of separated. `apps/server` has no parser and no
   vendored design system to check component names against, so it doesn't
   try to.
2. **Compile time, in `apps/web`'s browser compiler** — the authoritative
   check for "does this component or utility class actually exist in
   `@wonderful/ui`". It already rejects an unrecognized Tailwind utility
   class and fails to resolve an invented component export; nothing in
   layer 1 duplicates this, it only covers what a compiler can't see
   because no compile step runs server-side.

A tree can pass generation-time gates and still fail to compile (a real
component name that doesn't actually exist, for instance) — that failure
surfaces to the author in the harness exactly as a hand-typed mistake
would, per the existing compile-time rejection Drydock has always had.

## Hard gates (v0)

- Import only `@wonderful/ui-base`, `react`, and relative files (`./`,
  `../`) — no other package, ever.
- No invented component names (checked definitively at compile time; see
  above).
- No arbitrary or unavailable utility classes (checked definitively at
  compile time).
- A valid entry point, present in the tree, and valid relative file paths
  (checked by `validateFileTree`, the same check every write path in this
  repo goes through).
- No inline styling (`style={{...}}`) — use the design system's own
  spacing/layout props and utility classes.
- No real network calls (`fetch`, `XMLHttpRequest`, `WebSocket`, an HTTP
  client) — a prototype's data is local and honestly mocked, never a call
  that looks real but silently fails or accidentally reaches something
  real.
- Mock data lives in its own file (a `.json` import or a small `*Data.ts`
  module), not inlined as a large literal inside a component.
- Every form input has an accessible name — an `aria-label`,
  `aria-labelledby`, or an associated `<label>`.
- An icon-only control (no visible text) has an `aria-label`.

## The review corpus, and what it changed

The rubric below is not derived from first principles. It is derived from
`apps/server/src/agent/designReviewCorpus.ts` — a verbatim transcription of
31 comment pins (34 individual remarks) that a Wonderful designer left on
four real Wonderful screens in the `DS-examples-review` Figma file, where
each screen appears twice: a reference frame the design team considers
good, and the same screen as it ships in production.

Two findings from that corpus changed the design of this system rather
than just adding to it.

**Finding 1: none of the nine hard gates would have caught any of the 34
remarks.** Production code already imports the right components, uses the
right tokens, and has no inline styles — it passes every gate we have.
Every defect the reviewer found was in composition and calibration. The
gate layer is at its useful limit; the leverage is in the prompt and the
rubric. The corpus asserts this in data rather than prose: every finding
carries a `mechanicallyCheckable` flag, all are currently `false`, and a
test fails if that ever stops being true — which would mean a new gate is
genuinely owed.

**Finding 2: four of the pins are on the *reference* frame.** The screens
the design team holds up as good get picked apart too. There is no clean
exemplar, so a guardrail system built by imitating Wonderful's best
screens would inherit their defects along with their virtues. This is why
the prompt teaches the *reviewer's* eye rather than a canonical screen.

The clusters, by frequency:

| Cluster | n | What it sounds like |
|---|---|---|
| Contrast / weight | 8 | "Not readable", "Text too light", "Too dark", "Icons look darker than text", "Too colorfull" |
| Spacing | 6 | "Spacing between tabs", "not enough space", "Too much air?" |
| Geometry | 5 | "Feels to narrow (height)", "Corner radius not accurate", "button ratio feels off" |
| Component provenance | 5 | "Is this a thing?", "Do we have a component for that?", "deprecated style" |
| Affordance | 3 | "Looks like a button", "Primary?", "Should be icon only" |
| Container nesting | 3 | "why box in box?", "The full width button inside the gray box is weird" |
| Unsettled | 3 | "Toggle should be on the left?", "Do we like the shadow?" |
| State legibility | 1 | "Which one is selected" |

Note the contrast cluster cuts **both ways** — an icon too dark sitting
next to a placeholder too light, in the same field. The rule is not "go
darker"; it is that every element sits at one correct weight and siblings
inside a single control agree with each other.

Note also that **`unsettled` findings are questions, not rules.** They are
kept because the frequency of a question is signal, but nothing derived
from the corpus may turn one into an assertion — `getReviewerVoicePrompt`
filters them out, and a test enforces that. Encoding an argument that
hasn't finished is how a tool starts losing arguments on people's behalf.

### The one cluster Drydock already wins

"Do we have a component for that?", "Is this a thing?", "should this be a
component?", "deprecated style" — five remarks asking whether what the
reviewer is looking at is real. Drydock's browser compiler answers that
mechanically, on every generation, before a human ever sees the screen.
That is a structural advantage over a hand-built screen, and the reason
`componentProvenance` is a rubric axis rather than a worry.

## Rubric (shown, never enforced)

Five rated axes — the clusters above, minus the ones that are questions or
too rare to rate — plus two prose fields. Each is `strong` / `medium` /
`weak`, and the point of the rating is to tell a reviewer **where to
look**, which the previous axes (`wonderfulFit`, `handoffReadiness`)
couldn't: a "medium" on "wonderful fit" names no part of the screen.

- **`contrastLadder`** — does every text and icon sit on the 3-step ladder,
  and do siblings inside one control agree?
- **`spacingRhythm`** — did every gap come off the scale, with no zero-gap
  pairing and no dead space?
- **`affordanceClarity`** — does everything that looks interactive act
  interactive, and is exactly one action styled primary?
- **`containerDepth`** — is every nested container earning its nesting?
- **`componentProvenance`** — is every part a real `@wonderful/ui-base`
  component or an honest composition of primitives?

Plus:

- **`stateCoverage`** (prose) — which of loading / empty / error / success /
  disabled / needs-attention are covered, and which aren't. Kept despite
  having **no corpus support**: the corpus is static screenshots of one
  state each, so its silence here is a sampling artifact, not evidence that
  state coverage doesn't matter.
- **`selfFlagged`** (list) — the comments the model expects a Wonderful
  reviewer to leave on this screen, short and in their voice. The most
  useful field in the rubric: it turns the model's uncertainty into the
  reviewer's agenda instead of hiding it behind a rating.

## What's not in v0

- **The corpus is not yet a scored benchmark.** It records what good
  review looks like and feeds the prompt, but nothing yet runs a generated
  screen against it and produces a number. That is the obvious next step,
  and it is what would finally answer "is Drydock's output better than what
  we ship today" — a question this project has never been able to answer.
- Whether the model's self-rating is *accurate* is not itself checked.
  These are self-reports, not verified facts — see the note on
  `DesignReview` in `packages/prototype/src/types.ts`.
- The heuristics in `designGuardrails.ts` are regex-based, not an AST, and
  say so in their own comments: they under-report rather than
  over-report where a plain-text check genuinely can't tell (a `<label>`
  wrapping an input across multiple lines, for instance), because a gate
  that blocks should err toward missing a real violation rather than
  rejecting valid work.
- No mechanism yet aggregates `knownGaps`, `selfFlagged`, or weak ratings
  across generations to surface promotion candidates for the gate layer.
  Per Finding 1 this is now lower priority than it looked: the corpus
  suggests the next real win is in the prompt, not the gates.
