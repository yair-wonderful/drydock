# Origin: research and plan behind Drydock

A curated summary of the research and planning conversation that led to this
repo. It's distilled from a longer internal working session; internal
monorepo file paths, service names, and unrelated tooling/security material
have been intentionally left out as out of scope for a public repo. The full
conversation lives with the team internally for anyone who needs the raw
detail.

## The question that started it

Stripe published a [blog post](https://stripe.dev/blog/harbor-stripes-ai-assisted-prototyping-tool)
about **Harbor**, an internal tool that lets Stripe designers and PMs turn a
prompt into a running, on-brand prototype in their own design system
("Sail"). A related tool at Stripe, **Protodash** (built by design manager
Owen Williams), does something similar and is reportedly used more by PMs
than designers — they paste a PRD and get back a working flow before
designers are even pulled in. Coverage:
[Lenny's Newsletter](https://www.lennysnewsletter.com/p/the-internal-ai-tool-thats-transforming),
[ChatPRD](https://www.chatprd.ai/how-i-ai/stripe-owen-williams-on-buildling-internal-prototyping-studio).

The open question: Stripe says one engineer built Harbor's first version in
about 40 days. Was that fast or slow, and what would it take to build
something similar for Wonderful?

## Why "40 days" is the wrong number to anchor on

1. **40 days bought v1 only.** Harbor launched roughly in May 2026; the blog
   post describing it is from September 2026. Comment anchoring, versioning,
   an MCP toolset, and splitting the renderer out as a standalone service
   were all built *after* — months of follow-on work with more than one
   person.
2. **40 days was fast, not slow**, precisely because the expensive
   prerequisites already existed: a design system, dev infrastructure, and a
   model behind an API. The 40 days was assembly work — an in-browser compile
   loop and a rules bundle — not building those prerequisites from scratch.
3. **The real cost isn't in the 40 days at all.** Getting a model to reliably
   emit *non-generic* UI in your own design system is prompt/rules/eval work
   that never really finishes. Protodash reportedly took on the order of 18
   months of iteration to get there.

The actual risk for a project like this was never "can we do 40 days of
engineering" — it's shipping the shell quickly and then spending months on
output quality.

## The key architectural decision

The single biggest cost/schedule fork for a tool like this is **where a
prototype compiles and runs**:

- **In-browser compile** (what Harbor did, and what Drydock does): a
  lightweight worker compiles the prototype's own source with the design
  system loaded as an external dependency. No per-prototype sandbox, no
  container, no build queue, no infra bill — publishing is "ship the file
  tree; every viewer's browser compiles its own copy."
- **Reuse a server-side sandbox/build pipeline**: least new code, but
  inherits sandbox spin-up latency, per-prototype cost, and couples a
  designer-facing tool to infrastructure concepts (tenants, workspaces, app
  records) that a lightweight prototyping tool shouldn't need to expose.
- **Both**: fast iteration in the browser, with a later "promote to a real
  app" step. Best end state, but two runtimes to keep in sync.
- **Off-the-shelf builder + a design-system integration**: fastest to stand
  up, but no comment anchoring, no handoff into the existing stack, and data
  control leaves the perimeter.

Wonderful already had most of the substrate this choice depends on — an
existing production app runtime that loads a design system and a shared
React instance as externals via an import map, and treats the module URL to
mount as *just a string*. That meant a `blob:` URL produced by an in-browser
compiler could mount through the exact same path a real, server-built app
uses. Practically, this meant: **the hard 60% of "build a Harbor" — a
runtime that mounts a design-system-aware bundle from a URL, with source
anchoring already solved for a different reason (design-mode click-to-select)
— didn't need to be built.** The new work was narrower: an in-browser
compiler, the agent's self-inspection loop, publish/versioning/remix, and a
non-technical entry point.

### Architecture (validated in a Phase 0 spike)

```
prototype file tree (Postgres)
      │
      ▼  web worker
source-anchor transform ──► esbuild-wasm ──► blob: URL ──► existing app-mount path
(TSX in, TSX out,           (TSX → ESM,                    (shadow root + import map
 reused from the              same externals                + design tokens, all
 existing design-mode          list as the real              already built)
 tooling)                      app build)
```

The source-anchor step runs as a standalone pre-pass that parses TSX and
emits TSX — no bundler coupling — so it drops straight into an
in-browser-friendly transform without modification. Pinning the in-browser
bundler to the same version used by the real app build keeps prototype
output and production app output byte-comparable, which matters for
promoting a prototype to a real app later without silent drift.

### Phase 0 spike results

```
PASS  compiles in-browser and mounts on the existing app runtime
PASS  prototype resolves the design system to the host's own instance
PASS  source anchors emitted in-browser, loop/list instances flagged
PASS  dark mode flips with no recompile
PASS  a runtime-invented utility class has no rule in the host stylesheet
```

~450ms cold compile, ~28ms per edit — the number that makes the no-sandbox
architecture the right call.

Two things worth remembering from that spike (also recorded in this repo's
own README):

- **A test can pass for the wrong reason.** An early Tailwind-rejection test
  used a literal utility class string in the test file itself; the design
  system's own build-time scanner picked up that literal and generated the
  rule, so the "rejection" test spuriously passed. The fix was to compose the
  test class from a runtime value so it can't be scanned ahead of time.
- **A fixture bug that nothing caught.** A test fixture passed a prop a
  component didn't accept (text via children instead of a named prop), so it
  silently rendered empty rather than erroring. No compile error, no runtime
  error, just wrong UI — exactly the failure mode a model is likely to
  produce, and the strongest argument for putting "the agent inspects its own
  rendered page" into an early milestone rather than deferring it.

### The one real limitation

Tailwind v4 is a **build-time scanner**: a utility class invented at runtime
has no rule behind it and silently renders with no effect. Design-system
components are unaffected (they're scanned ahead of time), but a
model-written `className="pt-[63px]"` produces no error and no effect. The
decision: reject unknown utilities at compile time, at the author's own line,
naming the design-system alternative instead — the cheapest option, and one
that pushes prototypes toward design-system fidelity, which is the whole
point of the tool.

## Phased plan

0. **Spike** — compile a small TSX tree in a worker, mount it through the
   existing app-mount path, confirm design-system components render with
   correct tokens. The only real technical unknown; everything after is
   product work. *(Done — see above.)*
1. **Prototype as its own object** — a `Prototype` + `PrototypeVersion`
   model, file tree stored as JSON, tenant-scoped. Deliberately *not* an app
   record, *not* a workspace entity, *no* sandbox — that decoupling from
   existing infra concepts is the point.
2. **The agent loop** — server-side agent with file-edit tools over the
   tree, using an existing, already-battle-tested rules bundle for
   "how to write UI in our design system" as the prompt foundation.
3. **Self-inspection** — the agent reads the rendered DOM, can click, type,
   scroll, change viewport, screenshot, and see compile/runtime errors.
   Cheap here because the prototype lives in a shadow root in the same
   document as the tool itself — no browser automation needed.
4. **Publish / version / remix** — a share-link surface and version
   preview, largely rewiring existing publish machinery rather than building
   new.
5. **MCP toolset** — create/read/update/publish a prototype, and pull its
   file tree into a real repo as a handoff to engineering.
6. **Fixtures** — a curated library of realistic, anonymized mock data so
   prototypes look real without touching anything real.
7. *(Post-v1)* **Anchored comments** — pin a comment to a specific element;
   have it re-resolve as attached / needs-review / orphaned after a rewrite.
   Cheap to add because the signal set it needs (stable id, structural path,
   text evidence) was already being captured for an unrelated reason.

Status: this repo's own commit history and README reflect phases 0–3 as
largely built (in-browser compiler with utility rejection, the agent
generate/rewrite loop, comment anchoring across rewrites, and Blackbird as
the canvas/review layer). See the README for what's implemented today.

## Blackbird — the review-surface vision

Blackbird (`apps/web/src/blackbird/` in this repo) is a shared,
multiplayer canvas for live coded prototypes where humans and an agent
collaborate around the running artifact rather than around chat:

- **The artifact is live** — frames are the built app, never a screenshot;
  if it can't run, it doesn't belong on the canvas.
- **Feedback is anchored** — every comment knows its frame, screen, and
  place, and survives rebuilds because identity comes from the prototype's
  own manifest contract, not layout position.
- **The agent is a peer, not an oracle** — it joins with presence, reads and
  replies in the same threads, and announces work by changing the shared
  artifact, with bounded authority (allowlisted tools, a clean-worktree gate,
  revert-on-failure).
- **The loop closes without a human relay** — comment → agent → code change
  → rebuild → publish → scoped reload, visible to everyone in the session.
- **Trust is earned by verification** — the agent never claims a change is
  done ahead of actually verifying it renders correctly.

The goal: a URL a PM, a designer, and an agent can all join, where "can you
make it do X" becomes X happening on screen — attributed, threaded, and
reversible.
