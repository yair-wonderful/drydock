import { useCallback, useState } from 'react'
import { compileTree, setPrototypeStyles } from '@drydock'
import { createPackage, publishPackage } from '@drydock/blackbird'
import prototypeTree from '@drydock/fixtures/prototypeTree'
import rewrittenTree from '@drydock/fixtures/rewrittenTree'
// The canvas supplies the design system's compiled CSS. Imported from the
// library's own entry so Tailwind resolves its `@plugin`/`@import` against
// `libs/ui`, where those dependencies actually live.
import uiStyles from '@wonderful/ui/styles.css?inline'

setPrototypeStyles(uiStyles)

/**
 * The join, as a control.
 *
 * Compiles a multi-file TSX tree in this tab, packages the result as a
 * Blackbird prototype package, publishes it into the preview service worker,
 * and hands the canvas a frame URL. The canvas itself is untouched: it
 * receives `/preview/<uuid>/index.html` and renders it exactly like any other
 * package, because "built static app + canvas-manifest.json" never said who
 * built it or when.
 */
export default function DrydockPanel({ onFrame }) {
  const [status, setStatus] = useState('idle')
  const [detail, setDetail] = useState('')

  const compile = useCallback(async (tree, label) => {
    setStatus('compiling')
    setDetail('')
    try {
      const started = performance.now()
      const result = await compileTree(tree)
      if (!result.code) {
        setStatus('failed')
        setDetail(result.errors.map((e) => e.text).join('\n') || 'compile failed')
        return
      }
      // A NEW uuid each compile (the service worker keys its cache by uuid, and
      // a fresh package must not be served from a stale one) but a STABLE frame
      // id, so recompiling updates the frame in place instead of littering the
      // canvas. Blackbird's own placeNewFrame does the replacement.
      const uuid = `drydock-${Date.now().toString(36)}`
      const files = createPackage(result, uiStyles, {
        title: `Voice agents (${label})`,
        screens: [{ sid: 'agents', title: 'Voice agents' }],
        // The shared modules come from this canvas's Vite dev server, whose
        // transformed sources carry react-refresh calls.
        reactRefreshPreamble: import.meta.env.DEV,
      })
      const entry = await publishPackage(uuid, files)
      onFrame({ title: 'Drydock · Voice agents', url: entry, stableId: 'drydock-voice-agents' })
      setStatus('done')
      setDetail(
        `compiled ${Math.round(result.durationMs)}ms · packaged ${files.length} files · ` +
          `published ${entry} · total ${Math.round(performance.now() - started)}ms`,
      )
    } catch (error) {
      setStatus('failed')
      setDetail(error?.message ?? String(error))
    }
  }, [onFrame])

  const handleCompile = useCallback(() => compile(prototypeTree, 'v1'), [compile])
  // The same prototype after an agent rewrote it — a card inserted, a row
  // renamed, a row removed. This is the button that breaks positional pins.
  const handleRewrite = useCallback(() => compile(rewrittenTree, 'rewritten'), [compile])

  return (
    <div
      data-testid="drydock-panel"
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 10000,
        display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end',
        font: '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      {detail && (
        <pre
          data-testid="drydock-detail"
          style={{
            margin: 0, maxWidth: 460, whiteSpace: 'pre-wrap', textAlign: 'right',
            background: '#1a191e', color: status === 'failed' ? '#ff9f9f' : '#c9f5d0',
            padding: '8px 10px', borderRadius: 8,
          }}
        >
          {detail}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
      <button
        type="button"
        data-testid="drydock-rewrite"
        onClick={handleRewrite}
        disabled={status === 'compiling'}
        style={{
          padding: '8px 14px', borderRadius: 8, border: '1px solid #1a191e',
          background: 'white', color: '#1a191e',
          cursor: status === 'compiling' ? 'wait' : 'pointer', font: 'inherit',
        }}
      >
        Recompile rewritten
      </button>
      <button
        type="button"
        data-testid="drydock-compile"
        onClick={handleCompile}
        disabled={status === 'compiling'}
        style={{
          padding: '8px 14px', borderRadius: 8, border: '1px solid #1a191e',
          background: status === 'compiling' ? '#8a8a8a' : '#1a191e', color: 'white',
          cursor: status === 'compiling' ? 'wait' : 'pointer', font: 'inherit',
        }}
      >
        {status === 'compiling' ? 'compiling…' : 'Compile prototype (Drydock)'}
      </button>
      </div>
    </div>
  )
}
