/** Sanitizer for the `anchor` field, to be inserted into server/sync-server.mjs
 *  directly above `sanitizeComment`. Applied by blackbird-join/apply.ts. */

/**
 * Anchor signals arrive from other clients over the wire, so they get the same
 * treatment as everything else here: a strict whitelist with hard caps.
 *
 * Bounded deliberately. The signals are only ever compared as data — nothing
 * builds a selector or markup out of them — so the risk is not injection but
 * VOLUME: an unbounded anchor object would be persisted in the session file and
 * re-broadcast to every client on every change. Caps keep one client from
 * making a session expensive for everyone.
 */
function sanitizeAnchor(a) {
  if (!a || typeof a !== 'object') return undefined
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined)
  const int = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined)
  const frac = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
  // A captured signal: {value, unique}. `unique` is what stops the resolver
  // trusting evidence that was already ambiguous, so it must survive the wire.
  const sig = (s, max) =>
    s && typeof s === 'object' && typeof s.value === 'string'
      ? { value: s.value.slice(0, max), unique: s.unique === true }
      : undefined

  const out = {
    source: sig(a.source, 64),
    sourceFile: str(a.sourceFile, 200),
    sourceLine: int(a.sourceLine),
    sourceName: str(a.sourceName, 64),
    dsComponent: sig(a.dsComponent, 64),
    dsVariant: str(a.dsVariant, 64),
    domId: sig(a.domId, 128),
    testId: sig(a.testId, 128),
    text: sig(a.text, 200),
    ariaLabel: sig(a.ariaLabel, 200),
    role: str(a.role, 32),
    path: str(a.path, 600) ?? '',
    listKey: sig(a.listKey, 120),
    listIndex: int(a.listIndex),
    reveal: Array.isArray(a.reveal)
      ? a.reveal.filter((r) => typeof r === 'string').slice(0, 8).map((r) => r.slice(0, 64))
      : undefined,
    position: { x: frac(a.position?.x), y: frac(a.position?.y) },
    capturedAt: str(a.capturedAt, 40) ?? new Date().toISOString(),
  }
  // Drop the keys that came back undefined so the stored comment stays small
  // and a JSON round trip is stable.
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
  return out
}
