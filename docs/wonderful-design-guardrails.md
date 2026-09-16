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

## Rubric (v0, shown not enforced)

Each generation includes an honest self-report against:

- **Purpose clarity** — is the screen's job obvious in the first five
  seconds?
- **Action hierarchy** — one clear primary action, secondary actions
  visibly demoted?
- **Information density** — reads as an internal Wonderful product screen,
  not a landing page?
- **State coverage** — loading, empty, error, success, disabled, and
  needs-attention states considered where relevant?
- **Data realism** — mock data looks operational and plausible, not lorem
  ipsum or a toy example?
- **Workflow realism** — controls imply real product flows, not decorative
  UI?
- **Wonderful tone** — calm, specific, direct copy; no generic SaaS fluff?
- **Production handoff** — can an engineer tell what to copy, what to
  replace, and what's intentionally mocked?

The shipped `review` shape covers `purpose`, `primaryAction`,
`componentsUsed`, `mockData`, `knownGaps`, and three summarizing ratings
(`rubric.wonderfulFit`, `rubric.handoffReadiness`, `rubric.stateCoverage`)
rather than all eight items individually — granular enough to be useful,
compact enough that the model fills it out honestly rather than padding a
checklist.

## What's not in v0

- Whether the model's self-rating is *accurate* is not itself checked.
  These are self-reports, not verified facts — see the note on
  `DesignReview` in `packages/prototype/src/types.ts`.
- The heuristics in `designGuardrails.ts` are regex-based, not an AST, and
  say so in their own comments: they under-report rather than
  over-report where a plain-text check genuinely can't tell (a `<label>`
  wrapping an input across multiple lines, for instance), because a gate
  that blocks should err toward missing a real violation rather than
  rejecting valid work.
- No mechanism yet aggregates `knownGaps` or weak ratings across
  generations to surface promotion candidates for the gate layer — that's
  the natural next step once there's enough real usage to look at.
