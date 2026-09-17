/**
 * Wonderful's UX guardrails for agentic B2B — the layer above component
 * craft. Sourced from the internal `Wonderful.ai: UX Guardrails for
 * Agentic B2B` document, which frames the whole platform around one shift:
 * the user is no longer the operator, they are the manager of agents they
 * must supervise, audit and trust.
 *
 * This matters more to Drydock than the craft skills do. Nearly every
 * screen this tool will be asked to generate is a Wonderful platform
 * screen, which means an agent did something and a human has to decide
 * whether to believe it. A prototype that gets spacing right and gets
 * that relationship wrong is a prototype of the wrong product.
 *
 * WHAT IS DELIBERATELY LEFT OUT, and why:
 *
 * - Motion choreography (the cross-fade spec — scale 0.25→1, opacity 0→1,
 *   blur 4px→0 on a cubic-bezier; the ~100ms entrance stagger). These are
 *   build-time implementation specs. A Drydock prototype exists to get a
 *   layout and a flow reviewed; animation in it competes with the thing
 *   under review, and nobody reviews a prototype's easing curve. The
 *   restraint half of that section IS kept, and is gated — see
 *   `no-transition-all` in designGuardrails.ts.
 * - GPU hints (`will-change` placement). A production performance concern
 *   on live-updating surfaces, not a concern for a static prototype.
 * - Optical alignment ("icon-side padding = text-side padding − 2px").
 *   This cannot be expressed without an arbitrary bracketed value, which
 *   this repo gates against — and it shouldn't be in a prototype's
 *   className regardless: optical balance inside a button is the design
 *   system component's job, already solved once, not something a prototype
 *   author should be hand-tuning per screen.
 *
 * TWO UNRESOLVED QUESTIONS ABOUT THE SOURCE, flagged rather than guessed:
 *
 * 1. The document cites foundational principles as its source, but the
 *    document defining those principles was not supplied. Every
 *    rule below is the *applied* layer; the layer it is applied FROM is
 *    still missing from this repo.
 * 2. The document uses source package names outside the Drydock target set. Drydock targets
 *    `@wonderful/ui` (vendored from the monorepo) and `@wonderful/ui-base`
 *    (its published next-major), so no rule below depends on an API outside
 *    those packages.
 */

export const AGENTIC_UX_PROMPT = `## Designing for a user who manages agents, not one who operates software

Almost every Wonderful screen shows something an agent did, to a human who
has to decide whether to trust it. That relationship — not the component
inventory — is what makes a screen read as Wonderful.

**Traceability is the hierarchy.** Never show an agent's conclusion
without a visible path to the premise behind it. The outcome ("Contained",
"Escalated", "3 refunds issued") sits at the top and at the leading edge;
raw payloads, tool calls and step-by-step logs go BELOW it, in a section a
reader opens only if they doubt the outcome. A conclusion with no route to
its evidence is the one thing this product cannot ship.

**Group with space, not lines.** Spacing carries the structure, and the
ratio is the rule: the gap between two distinct agent tasks must be at
least TWICE the gap between a step and its own output. Roughly, one step
to its result is a small gap; one task to the next task is double that or
more. Reach for a hairline separator only for dense metadata, and only
after space has failed.

**Say who is driving.** A human action, an agent's proposal, and an
agent's completed execution must not look alike. Use an outline icon
variant for a pending or proposed state and a filled variant for an
executed or selected one, and make the status legible as a word, not as a
colour alone.

**Friction scales with reversibility, not with confidence.** If an action
cannot be undone inside the session, the screen shows an explicit preview
and requires deliberate consent (a type-to-confirm, not just a button) —
no matter how autonomous the agent is or how sure it sounds. Conversely,
do not put friction in front of something trivially undoable.

**Design the clean handoff.** When an agent stops and needs a human, three
things belong inside ONE container: the agent's summary of where it got
to, the specific thing blocking it, and the controls to unblock it. Never
make someone read a log to find out what is being asked of them. Put the
controls ("Approve", "Decline", "Refine") in a consistent footer zone,
visually separated from the agent's own text, with real breathing room
between adjacent bordered controls.

**Nest radii concentrically.** A box inside a box follows
\`outer radius = inner radius + padding\` — a card with 20px corners and
8px of padding holds a panel with 12px corners. Concentric corners are why
nesting reads as deliberate instead of accidental.

**Name the layer that won.** If a value is locked, inherited from a tenant
default, or overridden by a policy, the screen says WHAT set it and links
there. A control the user cannot change and cannot explain is the single
biggest source of "why is it doing that".

**Keep draft and published apart.** Any screen showing an editable draft
of something that also has a live version keeps the two visibly distinct
and shows a persistent diff count (\`+N −N\`). Never let someone believe
they are looking at what is running.

**Write for right-to-left.** Most Wonderful conversation traffic is
Hebrew and Arabic. Use logical direction utilities — \`ps-\`/\`pe-\`,
\`ms-\`/\`me-\`, \`text-start\`/\`text-end\`, \`start-\`/\`end-\`,
\`border-s-\`/\`border-e-\` — never their physical \`pl-\`/\`pr-\`,
\`ml-\`/\`mr-\`, \`text-left\`/\`text-right\` equivalents. Checked
mechanically. "Leading edge" above means start, not left.

**Spend motion like it is scarce.** The daily loop is someone triaging
many rows quickly; attention is the budget. High-frequency interactions
get instant feedback or a short opacity transition, nothing more. Never
\`transition-all\` — name the exact properties that change. Checked
mechanically.`;
