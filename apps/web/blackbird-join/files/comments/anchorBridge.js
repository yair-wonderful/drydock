/**
 * The canvas's half of comment anchoring.
 *
 * A prototype runs in its own frame, so the canvas cannot read its DOM. Capture
 * ("what element is under this pin?") and re-resolution ("where did that
 * element go after the rewrite?") both have to happen inside the frame, and the
 * canvas asks for them over postMessage — the same shape as the live protocol's
 * existing state / inspect / drift exchanges.
 *
 * Every call is request/reply with an id and a timeout, because the answer is
 * optional by design: a package built before this existed, or one that never
 * loaded the bridge, simply never replies. The caller gets null and the canvas
 * keeps its positional behaviour. Anchoring degrades; it does not break frames.
 */

const REPLY_TIMEOUT_MS = 4000

let nextRequestId = 1

function getFrame(frameId) {
  return document.querySelector(`iframe[data-frame-id="${CSS.escape(frameId)}"]`)
}

/**
 * Sends one request into a frame and resolves with its reply, or null if the
 * frame does not answer in time.
 */
function ask(frameId, message, replyType) {
  const frame = getFrame(frameId)
  const target = frame?.contentWindow
  if (!target) return Promise.resolve(null)

  const requestId = `anchor-${nextRequestId++}`

  return new Promise((resolve) => {
    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      resolve(value)
    }

    const onMessage = (event) => {
      // Match the SOURCE window, not just the id: another frame must not be
      // able to answer a question it was not asked.
      if (event.source !== target) return
      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.type !== replyType || data.requestId !== requestId) return
      finish(data)
    }

    const timer = setTimeout(() => finish(null), REPLY_TIMEOUT_MS)
    window.addEventListener('message', onMessage)
    target.postMessage({ ...message, requestId }, '*')
  })
}

/**
 * Asks a frame what element sits at a normalized point, and for everything that
 * might still identify it after a rewrite. Returns null when the frame has no
 * anchoring bridge — the comment is then positional, as before.
 */
export async function captureAnchorInFrame(frameId, x, y) {
  const reply = await ask(frameId, { type: 'CANVAS_CAPTURE_ANCHOR', x, y }, 'PROTOTYPE_ANCHOR')
  return reply?.signals ?? null
}

/**
 * Re-resolves anchors against the frame's CURRENT content.
 *
 * @param {string} frameId
 * @param {{id: string, signals: object}[]} anchors
 * @returns {Promise<Record<string, {status: string, reason: string, matched: string[], changed: string[], position: {x: number, y: number}|null}>>}
 */
export async function resolveAnchorsInFrame(frameId, anchors) {
  if (anchors.length === 0) return {}
  const reply = await ask(
    frameId,
    { type: 'CANVAS_RESOLVE_ANCHORS', anchors },
    'PROTOTYPE_ANCHORS_RESOLVED',
  )
  if (!reply?.results) return {}
  return Object.fromEntries(reply.results.map((result) => [result.id, result]))
}
