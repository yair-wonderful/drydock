# Drydock spike (Phase 0)

A throwaway-grade proof of one architectural claim:

> A multi-file React + TypeScript prototype can be compiled **in the browser**
> and rendered on Wonderful's existing app runtime — with no MicroVM, no
> sandbox provisioning, and no server-side build.

This is the Phase 0 of a Harbor-style prototyping tool for Wonderful employees.
Stripe's Harbor names its rendering engine *Drydock* and gives it a small
contract — "takes a multi-file React and TypeScript file tree and returns a
running page inside the browser, alongside a report that includes compile and
runtime failures". This spike implements that contract against our design
system, to find out what it costs us.

```bash
pnpm run setup:local
pnpm run dev      # starts the web app, API, and local model adapter
pnpm run verify   # drives the page in Chromium and asserts the core claims
```

## Why the cost is low for us specifically

We are not building this from nothing. The runtime contract already exists in
the repo, and the spike mostly *plugs into* it:

| Piece | Where it already lives |
|---|---|
| Bare specifiers → host modules | `wonderful-ui/src/lib/app-shared-deps.ts` publishes a real `<script type="importmap">` |
| Mounting a compiled module | `…/AppShell/appBundle.ts` → `loadAppBundle()` |
| Shadow root + token inheritance | `wonderful-ui/src/lib/app-shadow-theme.ts` |
| Component CSS into a shadow root | `…/AppShell/legacyAppStyles.ts` (constructed stylesheet) |
| `:root` → `:host` rewriting | `wonderful-ui/src/lib/app-style-sandbox.ts` |
| Element → source anchoring | `common/apptemplate/template/infra/source-anchor-plugin.ts` |
| The externals list | `common/apptemplate/template/vite.config.ts` |

Two properties of that existing code are what make the no-VM design work, and
both were verified rather than assumed:

1. **`loadAppBundle()` imports a URL string.** A `blob:` URL is as good as an
   `/app-assets/` one — same dynamic import, same module semantics.
2. **The host's import map is deliberately global, not scoped to
   `/app-assets/`** (there is a comment saying exactly why, at
   `app-shared-deps.ts:196`). So a module loaded from a `blob:` URL resolves
   `@wonderful/ui-base` through it just like a served bundle does.

## What the spike does

`src/drydock/` is the engine, and it is small:

- `transformAnchors.ts` — the in-repo source-anchor Babel plugin, ported to run
  in a browser. Only three things changed, all Node built-ins:
  `crypto.randomBytes` → `crypto.getRandomValues`, `crypto.createHash` → a
  synchronous FNV-1a (a Babel visitor cannot await WebCrypto), and
  `path`/`process.cwd()` → nothing, since a virtual tree's paths are already
  relative. The visitor, the opaque id and the loop/iterable flags are the
  original logic. This matters because it is what keeps **design mode** viable.
- `compileTree.ts` — `esbuild-wasm` over a virtual file tree, with the app
  template's externals list copied verbatim so a prototype and a real Wonderful
  App see the same module boundary.
- `getSharedRuntime.ts` — a miniature of the host's shared-deps module: live
  namespaces on a global, blob-URL re-export shims, one import map.
- `mountPrototype.ts` — shadow root, adopted component CSS, mirrored
  `data-theme-mode`.

## Results

`pnpm run verify`, 9/9, stable across repeated runs:

| Claim | Evidence |
|---|---|
| Compiles in-browser and mounts on the app runtime | shadow root created, 1 adopted sheet, no compile or runtime failures |
| The prototype gets the **real** design system | 241 exports reachable through `@wonderful/ui-base`; the rendered page is our components |
| Design mode survives in-browser compilation | 15 source anchors emitted, 3 correctly flagged as inside `.map()` callbacks |
| Dark mode needs no rebuild | surface flips `rgb(255,255,255)` → `rgb(24,24,24)` purely from token inheritance |
| Invented utility classes are rejected | a runtime-composed `pt-[NNpx]` fails the compile, at the author's own line, naming the design-system alternative |
| A rejection keeps the last good render | the page stays on screen behind an amber "last good render" marker |
| A covered utility class still compiles | `p-8` is accepted — the rule is "no class without a rule", not "no utilities" |

**Compile timings: ~450ms cold (esbuild-wasm init), ~28ms per edit after.**
That second number is the argument for the whole approach — it is the
difference between a tool a designer iterates in and one they wait on.

## The Tailwind limitation, and what was done about it

Tailwind v4 is a **build-time scanner**. `libs/ui/src/styles/index.css` says so
directly: *"Tailwind only emits a utility whose class name it has SEEN."*

A prototype compiled in the browser is source the host's Tailwind pass never
saw, so:

- ✅ **Design-system components are fully styled.** Their classes were scanned
  via `@source "../components"` at host build time. A prototype built out of
  `Card` / `Layout` / `Text` / `Button` / `Tag` needs no Tailwind step at all.
- ❌ **Hand-written utility classes would silently do nothing.**
  `className="pt-[63px]"` produces no rule — and, left alone, no error either.

That silent failure is the worst outcome available to a prototyping tool: the
page renders, it is simply wrong, and the author's next move is to doubt their
own eyes. So `checkUtilityClasses.ts` **rejects it at compile time**:

```
src/Dashboard.tsx:17:26  Unknown utility class "pt-[42px]": nothing in the
design system's stylesheet emits a rule for it, so it would render with no
effect. Instead, let the layout own spacing: `gap` on a `Layout.*`, or a
`Card`, which carries its own inset.
```

Four things make it worth having rather than merely present:

1. **The rule is correctness, not taste.** It rejects exactly the classes with
   no rule behind them — `p-8` is accepted because the design system already
   caused it to be emitted. It is not "no utility classes".
2. **It names the design-system answer.** Spacing points at `gap` and `Card`,
   typography at `<Text variant=…>`, layout at `Layout.Row`/`Stack`/`Grid`. A
   refusal without an alternative just moves the frustration.
3. **The line number is the author's.** The check runs against the original
   tree, never the anchored one — the anchor pass regenerates source through
   Babel and shifts every line, so an error raised against it points at code
   the author cannot see.
4. **A rejection does not cost you the page.** The last good render stays
   mounted behind an amber marker, so the report is read against the thing it
   describes rather than a blank rectangle.

Computed `className={...}` cannot be checked statically, so it emits a warning
rather than an error.

**Known trade-off:** the covered set is *incidental* — it is whatever `libs/ui`
happens to use. A prototype using `p-8` compiles today and could stop compiling
if the library's last `p-8` disappeared. That is real fragility, and still
strictly better than silent breakage, because it fails loudly at authoring time
with a message saying what to do instead. If it becomes a nuisance, the two
alternatives are a pre-generated utility superset (bounded, never complete) or
compiling Tailwind in the browser too (faithful, but a second compiler in the
hot path).

### A trap worth recording

The first version of the Tailwind check passed when it should have failed. The
test class was written as a literal in `scripts/verify.ts`, Tailwind's auto
content detection scanned that file, and the rule was emitted — so the very
class meant to be absent was present. The class is now **assembled at runtime
from a random value**. Any future test of "Tailwind never saw this" has to do
the same.

## Joining a canvas

`blackbird-join/` connects this engine to **Blackbird**, an infinite canvas for
coded prototypes, without changing anything inside it: a compiled tree is
packaged as a Blackbird *prototype package* and published through the canvas's
own service-worker protocol, arriving as an ordinary live frame in ~470ms.

The finding that matters: **the externals contract does not survive a frame
boundary**. In this spike a prototype shares the host's single React instance
through the host's import map, which is why its module is 4kb. A frame is a
separate realm, so the package must declare its own import map and the canvas
must serve the shared modules — one React instance per frame, which for a canvas
is the correct trade rather than a regression. See
[`blackbird-join/README.md`](./blackbird-join/README.md).

## Comment anchoring

`src/anchoring/` fixes the gap the Blackbird review identified: comments pinned
by position are re-aimed silently when the page is rewritten. Anchors store
element identity, re-resolve after a rewrite, and report **attached /
needsReview / orphaned** — never a quiet re-aim. Verified against an
agent-style rewrite in `scripts/verify-anchoring.ts` (6/6), including the
control showing what a positional pin would have pointed at instead. See
[`src/anchoring/README.md`](./src/anchoring/README.md).

## What this spike is not

- Not a service, not wired to the controller, no persistence, no auth. The
  prototype tree lives in React state.
- `@wonderful/app-sdk` is a stub; `@wonderful/genui-react` is left out of the
  import map entirely (`getSharedRuntime` skips a specifier with no namespace).
- The design system is consumed from **source** via Vite aliases to
  `libs/ui/src`, not from the published `@wonderful/ui-base`. In-monorepo that
  is the same library; a real deployment resolves the published package.
- esbuild-wasm runs on the main thread (it spawns its own internal worker). A
  real Drydock should own that worker explicitly.
