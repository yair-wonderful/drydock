# Drydock ⇄ Blackbird join

Blackbird is an infinite canvas for **coded prototypes**: live frames of a
running app, comments pinned to them, an agent with a seat in the session. Its
package contract (`spec/MANIFEST.md`) says a displayable prototype is *"a built
static app + `canvas-manifest.json`"*.

Drydock's premise is the opposite: **no build**. A multi-file TSX tree is
compiled in the browser in ~30–450ms and mounted, with no MicroVM and no server.

Those only look incompatible. The contract never says *who* built the app or
*when* — so a tree compiled in the browser a moment ago satisfies it exactly as
well as one built by CI. This directory is the whole adapter.

## Result

`node blackbird-join/verify.ts` against a patched, running canvas — 6/6, stable
across repeated runs:

| Claim | Evidence |
|---|---|
| An in-browser compile becomes a live Blackbird frame | `/preview/drydock-*/index.html` renders "Voice agents …" |
| The package satisfies the canvas-manifest contract | `manifestVersion: 1`, `prototype.entry`, `screens[]` |
| The design system renders inside the frame | a `Card`'s computed background read across the frame boundary |
| The frame speaks Blackbird's live protocol | canvas receives `PROTOTYPE_STATE(agents)` + `PROTOTYPE_ROUTE` |
| Recompiling updates the frame in place | frames 1 → 1, package uuid changes |
| No page errors in the round trip | compile → package → publish → frame, clean |

End to end: **~450ms compile, ~470ms to a live frame on the canvas.**

## What Blackbird had to change: nothing

The patch (`apply.ts`) is entirely additive — vendor modules, one control, one
set of resolve aliases, and two insertions in `src/App.jsx`. It does not touch
the canvas, the contract, comments, the service worker, or the agent. The
compiled prototype arrives through Blackbird's own `placeNewFrame` and its own
`UPLOAD_BUNDLE` service-worker protocol — the same door the folder-drop flow
already uses, opened programmatically.

That is the real result. If the join had required changing Blackbird's
internals, it would have been an argument against the architecture rather than
for it.

## The one architectural finding

**The externals trick does not survive the frame boundary.**

In the Phase 0 spike, a compiled prototype resolves `react` and
`@wonderful/ui-base` through the *host's* import map and shares the host's
single React instance — which is why the compiled module is 4kb. A frame is a
separate realm. It cannot borrow live module instances; it has to import them
by URL. So the package declares its **own** import map and the canvas serves
the shared modules (`files/vendor/`).

Each frame therefore gets its own React instance. For a canvas that is correct
rather than regrettable: per-frame state isolation is what makes many live
frames safe to have on screen at once. The cost is per-frame memory, bounded by
the browser's HTTP cache — the modules are fetched once and instantiated per
frame.

It also resolves a collision. Blackbird's own `index.css` defines
`--background` / `--foreground` on `:root`, the *same token names* as
`@wonderful/theme`. In one document those would fight. Across a frame boundary
they never meet.

## Three interop traps, recorded

All three cost real time and none is obvious from the outside:

1. **Vite's prebundled React exports only `default`.** `export * from "react"`
   in a vendor module yields no named bindings, and the prototype dies at eval
   with *"does not provide an export named 'createElement'"*. Named imports in
   ordinary app code are a Vite **transform**, not real exports, and a transform
   cannot reach across a frame boundary. Every vendor module re-exports each
   name explicitly off the namespace.
2. **Vite string aliases do not match a query.** `@wonderful/ui/styles.css`
   never matches `@wonderful/ui/styles.css?inline`, so the alias must be a regex
   that carries the query through in a capture.
3. **Vite's react-refresh preamble.** Shared modules served by a dev server
   carry refresh calls and abort with *"can't detect preamble"* unless the
   runtime is installed first. The package injects it only when
   `reactRefreshPreamble` is set; built chunks need none.

A fourth, smaller one: the engine no longer imports the design system's CSS
itself. Tailwind resolves `@plugin` / `@import` relative to the entry
stylesheet, so an import inside the engine made the engine's own directory the
resolution base and required every host to install the design system's CSS
dependencies beside it. The host now passes the compiled text
(`setPrototypeStyles`), which is what makes the engine portable between the
spike and Blackbird at all.

## Usage

```bash
node blackbird-join/apply.ts ../path/to/blackbird   # idempotent
cd ../path/to/blackbird && npm install && npm run dev
# the control is bottom-right: "Compile prototype (Drydock)"

BB_URL=http://127.0.0.1:5181/ node blackbird-join/verify.ts
```

`apply.ts` writes absolute paths into the canvas's Vite config, pointing at
`libs/ui`, `libs/theme` and this spike. That is fine for a spike and is the
first thing to replace if this graduates: the design system would come from the
published `@wonderful/ui-base`, and the vendor modules from built
`/__shared/*.js` chunks rather than a dev server.

## Comment anchoring, wired into the store

`node blackbird-join/verify-comments.ts` drives the real UI — compile, drop
three real pins through Blackbird's own comment mode, recompile the rewritten
prototype, read the verdict off the rendered pins. 6/6:

| Claim | Evidence |
|---|---|
| Comments store an element anchor, not just x/y | 3 comments, 3 anchored |
| Every anchor is re-resolved after the rewrite | 3 of 3 pins carry a resolution |
| The moved card stays `attached` | *"Matched on a stable identity signal; the element may have moved, but it is the same element."* |
| The renamed row is `needsReview` | *"Found the element, but its source anchor and text (edited) changed since the comment was written."* |
| The removed row is `orphaned` | *"Nothing in the rewritten page matches this comment's element closely enough to claim it."* |

This is the one part of the join that **modifies** Blackbird rather than adding
to it — see [`files/comments/README.md`](./files/comments/README.md) for what
changed and why it has to live in the store.

Two things the package had to start doing, both found by wiring it up:

1. **Publish the anchor map.** The compiled module carries
   `{...(globalThis.__WF_ANCHORS__?.[id])}` on every element, and that global is
   never set in production — so inside a frame every element had no identity but
   its text, and a renamed row read as deleted. `createPackage` now emits
   `anchors.js`, a classic script (module scripts are deferred; the map must
   exist before the first render).
2. **Report the screen, not the URL.** See the bug in the comments README: a
   per-compile uuid in the route made every comment vanish on rebuild.

## What this does NOT show

- No agent wrote the tree — the fixture is fixed. The join proves the pipe, not
  the loop.
- Nothing is persisted server-side: packages live in the service worker's cache,
  keyed by a uuid minted per compile, and comments live in `localStorage` as
  they already did.
## Multiplayer

`node blackbird-join/verify-sync.ts` starts the canvas's own sync server, joins
one session from two independent browser contexts, and checks that an anchor
captured by one client reaches the other intact and still resolves there after a
rebuild. 6/6:

| Claim | Evidence |
|---|---|
| The anchor survives the server's field whitelist | server holds `source, sourceFile, sourceLine, sourceName, text, path, reveal, position, capturedAt` |
| The `unique` flags survive the wire | `{"value":"Outbound sales","unique":true}` |
| Bob receives Alice's comment | pin #1 on Bob's canvas |
| **Bob re-resolves an anchor Alice captured** | *"found the element, but its source anchor and text (edited) changed"* |

This was previously listed here as "not evidence, reasoning" — and the reasoning
was wrong. `sanitizeComment` whitelists every field on the wire and `anchor` was
not among them, so the server stripped it and broadcast the stripped copy back
over each client's optimistic write. Anchoring worked perfectly alone and did
nothing the moment a session was shared.

The regression test was checked against the bug it describes: with the server
field removed, it reports `server holds anchor with keys: (none — stripped)` and
drops to 2/6.
