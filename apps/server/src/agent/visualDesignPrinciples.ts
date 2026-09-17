/**
 * Wonderful's own internal design-craft canon, condensed into the model's
 * system prompt. Sourced from two internal skills the design/UI teams
 * maintain — `ui-visual-design` (composition judgment: hierarchy, spacing,
 * color discipline, motion, the recurring layout recipes across Wonderful's
 * best screens) and `ui-components` (the iron rules for using
 * `@wonderful/ui` correctly) — condensed here to what a prompt can act on
 * and a v0 heuristic layer can check, not reproduced in full.
 *
 * This is what upgrades several guardrail items from "shown in the rubric"
 * to "enforced": several rules both skills call HARD/IRON (no exceptions,
 * not a judgment call) are objective, binary, and cheap to check by regex —
 * no uppercase text-transform, no hardcoded colors, no arbitrary bracketed
 * Tailwind values. Those are promoted straight into `designGuardrails.ts`'s
 * mechanical checks rather than left as prose the model might skip, per
 * this repo's own rule for what earns a gate: mechanically checkable AND
 * already treated as non-negotiable, not merely aesthetic preference.
 *
 * NOTE ON SOURCE FIDELITY: the uploaded `ui-components` skill file had an
 * unresolved git merge conflict in its own text (an "Iron rules" table
 * appearing twice, under `<<<<<<< Updated upstream` / `>>>>>>> Stashed
 * changes`). The fuller ("Stashed changes") version was used here since it
 * is a strict superset — the shorter version says only "don't add to the
 * library yourself," which the fuller version also says. That source file
 * should still get its conflict resolved for real; this is a workaround,
 * not a fix.
 *
 * ONE RULE DELIBERATELY DROPPED: `ui-components` also states a bare "Stack
 * takes only gap + children — no className" iron rule. This is NOT included
 * above and NOT mechanically enforced, because it's contradicted by this
 * repo's own known-good, actually-compiling fixture — systemPrompt.ts's
 * COMPONENT_EXAMPLE (the same one apps/web's verify.ts proves against the
 * real compiler) uses `<Layout.Stack gap="lg" className="p-8">`
 * successfully. The skill's rule most likely describes a different, bare
 * `Stack` export than `Layout.Stack` — but asserting a rule contradicted by
 * verified behavior is worse than omitting it, so it stays out pending
 * clarification of which component it actually applies to.
 */

export const VISUAL_DESIGN_PROMPT = `## Wonderful visual design canon (condensed)

Using the right component is necessary but not sufficient — arrange it the
way Wonderful's own best screens do:

- **Never render text in all caps.** No \`uppercase\` class, no
  \`text-transform: uppercase\`, anywhere a person reads a word or sentence.
  Checked mechanically — see below.
- **Text color is a 3-step ladder, never more:** primary (the one line per
  block that matters), secondary (supporting text), tertiary (metadata —
  timestamps, counts). Never a 4th shade, and never a raw light-grey
  Tailwind class as text color.
- **Never hardcode a color** — no hex (\`#333\`), no \`rgb()\`/\`hsl()\`, no raw
  Tailwind color-shade class (\`text-gray-500\`, \`bg-red-600\`). Use the
  design system's own semantic tokens/props instead. Checked mechanically.
- **No arbitrary bracketed Tailwind values** (\`w-[31px]\`, \`text-[13px]\`,
  \`pt-[37px]\`) — if it doesn't fit the scale, the layout is off-grid, not
  the utility. Checked mechanically.
- **Accent/semantic color is rationed to four jobs only:** the one primary
  action, status/state, selection/focus, chart-series identity. Never for
  chrome, borders, section labels, or body text.
- **One primary action per screen.** Exactly one button gets full-strength
  primary treatment; everything else is secondary or quieter.
- **No two elements ever sit at zero gap**, in either direction — not a
  caption against the row below it, not badges/buttons packed edge to edge.
  Every pairing gets at least the smallest real spacing step.
- **Never compress a sequence into an inline arrow chain** ("A → B → C")
  unless the user explicitly asked for exactly that format — give a
  multi-step flow real rows or a steps indicator instead.
- **Never add a small-grey disclaimer line at the bottom of a screen** that
  wasn't explicitly requested as visible footer text — fold a genuine
  caveat into a tooltip on a small icon instead.
- **Never pair an icon with a plain text link** — a text link has no real
  hit area for an icon to sit in; use a real button variant instead
  (solid/outlined/dashed/text), reserving the plain link for inline
  sentence links.
- **Avoid an em dash inside a sentence in UI copy** — use a period, a
  comma, or two sentences; this reads as AI-writing voice, not how a
  product writer phrases something.
- **Recognized layout recipes — reach for these before inventing a new
  shape:** a heading paired with exactly one grey subtitle line beneath
  it; a list/nav/table row as icon → label (left) → status/value (right);
  a KPI tile as grey label → one bold large value → grey caption/delta;
  status as a soft-tinted pill with a word or icon (never color alone,
  never a dot that's identical on every row); a selected card/row that
  tints rather than repaints; an empty/create state with MORE whitespace
  than the populated version, not less.

From \`@wonderful/ui-base\` component usage specifically:
- A component you didn't author needing its own layout container: give it
  an explicit direction (a row-vs-column layout primitive defaults to one
  axis — don't rely on an implicit default when you mean the other axis).
- \`Card\`-like components render children into their own named slots
  (header/body/footer/list) — a bare child outside a slot sits flush
  against the edge with no inset.
- An icon-only button's icon goes in the component's own icon-slot prop,
  not as a text child, and it still needs an \`aria-label\` — a tooltip is
  visual only and is not an accessible name.
- Prefer icon buttons with tooltips over a row of text-label buttons for
  table row actions (stays a constant width across locales); more than
  about three actions, or any destructive/rare one, becomes an overflow
  menu instead of a longer row of icons.
- Use logical properties for anything direction-sensitive (start/end,
  not left/right) so the layout doesn't break under RTL.
- Elevation (shadow) comes from the design system's own elevation
  mechanism, never a hand-written shadow utility.`;
