/**
 * General UX foundations, distilled from the internal skill library:
 * `law-of-proximity`, `law-of-common-region`, `fitts-law`, `hicks-law`,
 * `millers-law`, `aesthetic-usability`, `form-design`, `loading-states`,
 * `navigation-patterns`, `layout-grid`, `information-architecture`, and the
 * craft sections of `interface-design`.
 *
 * SELECTION RULE. Those skills run to thousands of words and most of it
 * does not belong in a generation prompt. A rule is included below only if
 * it is (a) concrete enough to act on while writing a component, (b) not
 * already covered by `visualDesignPrinciples.ts` or
 * `agenticUxGuardrails.ts`, and (c) relevant to the kind of screen Drydock
 * is actually asked for — an internal Wonderful platform screen. Process
 * advice (card sorts, tree testing, usability studies), research method,
 * and anything about marketing pages is dropped entirely: correct, and not
 * something a model can act on mid-generation.
 *
 * The review corpus is why this file is short. Its lesson was that
 * leverage comes from specific signal, not more general rules — a prompt
 * that doubles in length dilutes the Wonderful-specific parts that make
 * output look like Wonderful. Three rules here earn their place by being
 * independently corroborated by the corpus, and those are called out.
 *
 * TWO SKILLS DELIBERATELY NOT ENCODED:
 *
 * - `animation-principles` conflicts with Wonderful's own agentic-UX
 *   document and loses to it. It prescribes a 30–50ms entrance stagger and
 *   recommends `will-change` for performance; Wonderful's document says
 *   stagger ~100ms and only for infrequent macro changes, and warns
 *   `will-change` is for elements that genuinely benefit. A generic skill
 *   does not override the organisation's own considered position. The one
 *   rule taken from it, `prefers-reduced-motion`, is moot here because
 *   prototypes do not animate.
 * - `interface-design`'s core loop is architecturally incompatible with
 *   Drydock — see `docs/wonderful-design-guardrails.md`. Its craft
 *   sections (hierarchy levers, tabular numbers, concentric radii) are
 *   kept; its "explore the domain, invent a signature, choose a palette
 *   and typeface" process is not, because a Drydock prototype compiles
 *   against a fixed design system and is supposed to look like Wonderful
 *   rather than like a bespoke direction.
 */

export const UX_FOUNDATIONS_PROMPT = `## Layout and interaction foundations

**Group with proximity first, a container second.** Spacing is free;
a container costs visual weight. Use the weakest thing that works —
space, then a tonal background, then a border, then a full card surface.
And keep container nesting to at most two levels: a box inside a box
inside a box is the single most common way a screen starts to look noisy.

**Space asymmetrically to show structure.** A section heading sits closer
to the content beneath it than to the section above it. A label sits
closer to its own input than to the next field. Row padding is tighter
than the gap between rows. The ratio is what communicates grouping — there
is no single correct pixel value.

**Put actions where the thing they act on is.** A card's action belongs on
that card, not in a toolbar across the screen. Give a destructive or rare
action distance and less visual weight; give the primary action size and
proximity. An icon-only control's hit area is its padding, not its glyph —
never ship a 16px target.

**Cap simultaneous choices.** Past about five options, group them or defer
the rest behind progressive disclosure — grouping beats deleting. A flat
list of twelve is harder to scan than three groups of four. This applies
to nav items, toolbar actions, filters and form fields alike.

**Hierarchy runs on three levers, not one.** Size, weight, and colour
together. A single text size can carry three tiers through weight and
colour alone — a value at 600/primary, its label at 500/secondary, its
metadata at 400/tertiary — and that reads more cleanly than two sizes two
steps apart. If you squint and cannot tell the tiers apart, it is too
flat. Exactly one element per screen wins.

**Any number that changes gets tabular figures**, so a counter or a table
column does not reflow as its value updates.

**Every navigation item needs an unmistakable selected state**, and it
must be legible by more than colour — weight, an indicator bar, or a
filled background. (A Wonderful reviewer has already flagged exactly this:
"Which one is selected".)

**Forms:**
- One column. Two columns break reading order and make field order
  ambiguous.
- Every field keeps a persistent, top-aligned label. A placeholder is
  never the label — it disappears the moment someone types.
- Mark what is OPTIONAL, not what is required. If most fields are
  required, asterisking them all is noise.
- Helper text goes under the label and above the field.
- Field width signals expected length: a postcode field is short, a
  description field is wide.
- Validate when someone leaves a field, not on every keystroke. Put the
  error directly under that field, and say how to fix it — "Email address
  must include @", never "Invalid email".
- Match the control to the data: radios when there are five or fewer
  options and all should be visible, a select or combobox past that,
  checkboxes for multi-select, a real date control for dates.

**States are part of the screen, not an afterthought.** Show a skeleton
shaped like the content that is coming, never a blank area. Nothing under
100ms needs an indicator. An empty state says what to do next and gets
MORE room than the populated version. Design the error and empty states
with the same care as the main path — a rough error screen reads as a
broken product, and that impression carries to every screen around it.`;
