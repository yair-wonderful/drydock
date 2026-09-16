# Comment anchoring

Blackbird pins a comment as `{frameId, route, x, y}`, where x/y are fractions of
the frame rect. That is accurate until the page changes. Move a card, insert a
row, and the pin still sits at 43% × 67% — now pointing at whatever happens to
be there. The comment has not been lost loudly; it has been **re-aimed
silently**, which is worse, because the thread still reads as though it were
about the thing under the pin.

This module stores identity instead of position, and is allowed to fail.

## The rule

**Never silently move a comment to a plausible replacement.** Three outcomes:

| Status | Meaning |
|---|---|
| `attached` | This is the element. It may have moved; movement is not disagreement. |
| `needsReview` | Probably this element, but something about it changed — or two candidates match about equally and picking one would be a guess. |
| `orphaned` | Nothing in the rewritten page matches closely enough to claim. |

## Measured against a real rewrite

`scripts/verify-anchoring.ts` compiles the prototype, pins three comments,
compiles an agent-style rewrite (a card inserted, a row renamed, a row
removed), and re-resolves — 6/6, stable across runs:

| Pin | Result |
|---|---|
| A card that moves | `attached` — matched on list key, text and element name |
| A row that is renamed | `needsReview` — *"Found the element, but its source anchor and text (edited) changed"* |
| A row that is removed | `orphaned` |

And the control, which is the actual argument for this module — what a
positional pin would have pointed at after the same rewrite:

- "Median latency" → **"Escalations"** (the newly inserted card)
- "Outbound sales" → **the page header**
- "After-hours triage" → **a different row's statistics**

Three comments, silently about three wrong things.

## Signals, and why they are weighted as they are

| Signal | Weight | Survives |
|---|---|---|
| Source anchor | 100 | Layout, text and ordering changes — but **not** a source line shift |
| `id` / `data-testid` | 60 | Anything but a deliberate rename |
| List key (the item's own text) | 40 | Reordering, which is the common rewrite |
| Text | 30 | …is the thing a rewrite most often edits |
| `aria-label` | 25 | Usually |
| DS component | 20 | Almost anything, but rarely unique alone |
| Structural path | 8 | Nothing — a tiebreak, never a reason |

Two rules do the real work:

**Uniqueness is recorded at capture time.** A signal that was already ambiguous
when the comment was written can never prove anything later, so it scores a
quarter of its weight. Evidence that could not identify the element then cannot
identify it now, and pretending otherwise is exactly how a comment gets
re-aimed.

**Text is compared by similarity, not equality.** Exact comparison cannot tell a
rename from a deletion, and rewrites rename constantly — without this, every
copy edit orphans its comments and people stop trusting the feature. A near
match (Dice ≥ 0.7 over character bigrams) scores partially and is recorded as
*changed*, which is what produces `needsReview`. The threshold separates the two
cases that actually occur: a rename keeps most of its characters, while two
different rows sharing a template ("… calls · …% resolved") do not clear it.

## Two findings worth carrying forward

**The source anchor's salt had to change.** The in-repo plugin
(`common/apptemplate/template/infra/source-anchor-plugin.ts`) salts ids with
`crypto.randomBytes` per build, which is right when an id only has to survive
until the page renders. Anchoring needs an id to survive a **recompile** — with
a per-compile salt, every id changes on every edit, so the strongest signal is
worthless at precisely the moment it is needed. The browser port uses a fixed
namespace, making an id a pure function of `file:line:col`.

**Even so, the source anchor is not a cross-rewrite identity.** Insert a line
above an element and its id changes, because its line changed. It is decisive
*within* a compile (design mode: click an element, tell the agent which source
line) and merely helpful across one. The semantic signals do the load-bearing
work — which is why Harbor's own list is semantic, and does not include a
source location.

## Not done

- Not wired into Blackbird's comment store or drawer. The engine is transport
  agnostic; connecting it means persisting `AnchorSignals` beside each comment
  and re-resolving on republish.
- `reveal` (collapsed ancestors) is captured but not yet acted on — a resolver
  that finds an element inside a closed dialog should say so rather than
  treating it as missing.
- Uniqueness is measured against the element's own root. For a prototype in an
  iframe that is the frame document; the caller must pass the right root if it
  ever differs.
