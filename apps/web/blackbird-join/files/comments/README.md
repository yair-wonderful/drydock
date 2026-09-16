# The comment-store edits

Everything else in `blackbird-join/` is additive — Blackbird gains files and
aliases and loses nothing. These are different: they **modify Blackbird's own
comment store**, because anchoring is not something a canvas can have bolted on
from outside. The store owns a comment's identity and decides whether a pin
still points at anything; that decision has to live there.

Four changes, smallest first.

### 1. `src/comments/anchorBridge.js` — new file

The canvas's half of the protocol. A prototype runs in its own frame, so the
canvas cannot read its DOM: capture ("what element is under this pin?") and
re-resolution ("where did it go?") both happen inside the frame, over
postMessage. Request/reply with an id, a source-window check and a timeout,
because the answer is **optional by design** — a package with no anchoring
bridge never replies, the caller gets `null`, and the comment stays positional
exactly as before. Anchoring degrades; it does not break frames.

Applied automatically by `apply.ts`.

### 2. `src/comments/storage.js` — persist the anchor

One field on `createComment`: `anchor: fields.anchor || undefined`. Applied
automatically.

### 3. `src/comments/CommentsContext.jsx` — capture and re-resolve

See `CommentsContext.reference.jsx` for the patched file. Four additions:

- **Import** the bridge (applied automatically by `apply.ts`).
- **`anchorStatus` state** — `{ [commentId]: { status, reason, matched,
  changed, position } }`.
- **Capture in `placeDraftAt`.** The draft is set synchronously so the UI is
  never blocked, and the anchor is merged in when the frame answers. Captured at
  **placement**, not at submit: by the time someone finishes typing, the page
  may have moved on.
- **`resolveFrameAnchors` + a `MutationObserver` on every frame's `src`.**
  Deliberately keyed on `src` rather than on the route protocol, so a package
  that never adopted the route snippet still gets its comments re-checked. The
  `load` listener covers a changed package behind an unchanged URL.

### 4. `src/comments/FramePins.jsx` — show the verdict

See `FramePins.reference.jsx`. The pin's `title` carries the status and the
reason, and the border carries it visually: amber for `needsReview`, dashed and
dimmed for `orphaned`.

A pin **moves** whenever an element was identified — `attached` *or*
`needsReview` — because that is where the thing being discussed actually is
now, and leaving it at a stale coordinate points at nothing. Moving is only
dishonest when it is **silent**, and `needsReview` is not silent. `orphaned`
stays put and goes dashed, because there is nothing to move it to.

### 5. `server/sync-server.mjs` — let the anchor onto the wire

Every field on the multiplayer wire is whitelisted (`sanitizeComment`), which is
a deliberate security property: one client cannot inject arbitrary fields into a
shared session. `anchor` was not on the list.

The failure mode was quiet and total. A client writes optimistically, the server
strips the anchor, then broadcasts the stripped copy back — and every client,
including the author, replaces its local array with the server's. **Anchoring
worked perfectly alone and silently did nothing the moment a session was
shared.**

The fix extends the whitelist rather than bypassing it. `sanitizeAnchor` caps
every string and array, because these signals are persisted in the session file
and re-broadcast on every change; the risk is not injection (nothing builds a
selector or markup from them) but volume. The `unique` flag is carried
explicitly — it is what stops the resolver trusting evidence that was already
ambiguous, so losing it would quietly weaken every resolution.

Applied automatically by `apply.ts`.

## The bug this turned up

Blackbird scopes a comment to a screen by exact route equality
(`isCommentVisibleAtRoute`), and the route came from `location.pathname`. A
Drydock package lives at `/preview/<uuid>/index.html` with a fresh uuid per
compile — so every recompile reported a route no existing comment matched, and
**every comment on the screen silently disappeared**. Not re-aimed: gone.

That is arguably worse than the positional problem this work set out to fix,
and it was invisible until comments and rebuilds were exercised together.

The fix is on the package side, in `createPackage`: report a route derived from
the **screen** (`'/' + sid + location.hash`), never from `location.pathname`. A
comment belongs to a screen, not to the build that happened to be serving it.
