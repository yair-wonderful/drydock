import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  createComment as persistCreate,
  deleteComment as persistDelete,
  listComments,
  updateComment as persistUpdate,
  getStoredAuthor,
  setStoredAuthor,
} from './storage'
import { startSync, isSyncEnabled, getSessionName } from './sync'
import { captureAnchorInFrame, resolveAnchorsInFrame } from './anchorBridge'

/**
 * Shape of a draft placement (pin dropped but comment not yet submitted).
 * @typedef {Object} DraftPlacement
 * @property {string} frameId
 * @property {string} route
 * @property {number} x
 * @property {number} y
 */

const CommentsContext = createContext(null)

// eslint-disable-next-line react-refresh/only-export-components -- context module: hook + provider belong together
export function useComments() {
  const ctx = useContext(CommentsContext)
  if (!ctx) throw new Error('useComments must be used inside <CommentsProvider>')
  return ctx
}

/**
 * Provider. Owns:
 *   - `comments`: the full Comment[] from localStorage
 *   - `frameRoutes`: { [frameId]: string } — each frame's currently reported route
 *   - `commentMode`: are we in placement mode? (click on iframe → drop pin)
 *   - `drawerOpen`: is the side drawer open?
 *   - `draftPlacement` / `selectedId`: the in-flight pin or selected pin
 *   - `authorName`: persisted to localStorage between sessions
 *
 * It also installs a window-level listener for `message` events of type
 * `PROTOTYPE_ROUTE`. Prototypes embed the snippet from
 * `snippet-for-prototypes.js` which posts these events on every internal
 * navigation. We match the message source to a specific iframe element via
 * `contentWindow === e.source`, then update that frame's route.
 *
 * Each prototype iframe must have `data-frame-id` on the <iframe> element
 * for the source matching to work.
 */
export function CommentsProvider({ children }) {
  const [comments, setComments] = useState(() => listComments())
  const [frameRoutes, setFrameRoutes] = useState({})
  const [commentMode, setCommentMode] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [draftPlacement, setDraftPlacement] = useState(null)
  const [authorName, setAuthorNameState] = useState(
    // In a multiplayer session the URL's ?name= is the identity.
    () => (isSyncEnabled() && getSessionName()) || getStoredAuthor(),
  )
  const [showResolved, setShowResolved] = useState(true)
  /**
   * Per-comment anchor resolution: { [commentId]: { status, reason, matched,
   * changed, position } }. Rebuilt whenever a frame's content changes, which is
   * the moment a positional pin would silently start pointing at the wrong
   * thing.
   */
  const [anchorStatus, setAnchorStatus] = useState({})

  const refresh = useCallback(() => {
    setComments(listComments())
  }, [])

  // Multiplayer session: connect once, re-read the store on every server push.
  useEffect(() => {
    if (!isSyncEnabled()) return
    startSync()
    const onSynced = () => refresh()
    window.addEventListener('bb:comments', onSynced)
    return () => window.removeEventListener('bb:comments', onSynced)
  }, [refresh])

  // Listen for route updates from cooperating prototypes.
  useEffect(() => {
    // Routes are compared by exact string equality (types.js). The canvas
    // cache-busts frame URLs with a per-client `v` query param on reload
    // broadcasts, and the snippet reports pathname+search+hash — so `v` (and
    // any other volatile params it drags along) must be stripped here, at the
    // single receipt point, or no two clients would ever agree on a route.
    const normalizeRoute = (raw) => {
      const hashAt = raw.indexOf('#')
      const base = hashAt === -1 ? raw : raw.slice(0, hashAt)
      const hash = hashAt === -1 ? '' : raw.slice(hashAt)
      const [path, query = ''] = base.split(/\?(.*)/s)
      const params = new URLSearchParams(query)
      params.delete('v')
      const q = params.toString()
      return `${path}${q ? `?${q}` : ''}${hash}`
    }
    const onMessage = (e) => {
      if (!e.data || typeof e.data !== 'object') return
      if (e.data.type !== 'PROTOTYPE_ROUTE') return
      const route = typeof e.data.route === 'string' ? normalizeRoute(e.data.route) : ''
      // Find which iframe sent this by matching contentWindow.
      const iframes = document.querySelectorAll('iframe[data-frame-id]')
      for (const iframe of iframes) {
        if (iframe.contentWindow === e.source) {
          const frameId = iframe.dataset.frameId
          if (!frameId) return
          setFrameRoutes((prev) => (prev[frameId] === route ? prev : { ...prev, [frameId]: route }))
          return
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Persist author across sessions.
  const setAuthorName = useCallback((name) => {
    setAuthorNameState(name)
    setStoredAuthor(name)
  }, [])

  const enterCommentMode = useCallback(() => {
    setCommentMode(true)
    setSelectedId(null)
    setDraftPlacement(null)
  }, [])
  const exitCommentMode = useCallback(() => {
    setCommentMode(false)
  }, [])
  /**
   * Functional toggle so callers don't need to read the current commentMode
   * value — useful from places that would otherwise close over a stale state.
   */
  const toggleCommentMode = useCallback(() => {
    setCommentMode((prev) => {
      if (!prev) {
        setSelectedId(null)
        setDraftPlacement(null)
      }
      return !prev
    })
  }, [])

  /**
   * Called when the user clicks while comment mode is on. Coordinates are in
   * viewport space; we figure out which frame's iframe was clicked and
   * compute normalized coords within that iframe.
   * Returns true if a draft was placed; false if the click missed.
   */
  const placeDraftAt = useCallback((clientX, clientY) => {
    const iframes = document.querySelectorAll('iframe[data-frame-id]')
    for (const iframe of iframes) {
      const rect = iframe.getBoundingClientRect()
      if (clientX < rect.left || clientX >= rect.right) continue
      if (clientY < rect.top || clientY >= rect.bottom) continue
      const frameId = iframe.dataset.frameId
      if (!frameId) continue
      const x = (clientX - rect.left) / rect.width
      const y = (clientY - rect.top) / rect.height
      const placement = {
        frameId,
        route: frameRoutes[frameId] ?? '',
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      }
      setDraftPlacement(placement)
      // Ask the frame what element is under the pin. Asynchronous and
      // best-effort: the draft is usable immediately, and the anchor is merged
      // in when (if) the frame answers. Captured at PLACEMENT, not at submit —
      // by the time someone finishes typing, the page may have moved on.
      captureAnchorInFrame(frameId, placement.x, placement.y).then((signals) => {
        if (!signals) return
        setDraftPlacement((current) =>
          current && current.frameId === placement.frameId && current.x === placement.x
            ? { ...current, anchor: signals }
            : current,
        )
      })
      setSelectedId('__draft__')
      setCommentMode(false)
      setDrawerOpen(true)
      return true
    }
    return false
  }, [frameRoutes])

  const cancelDraft = useCallback(() => {
    setDraftPlacement(null)
    setSelectedId(null)
  }, [])

  const submitDraft = useCallback((body) => {
    const trimmed = body.trim()
    if (!draftPlacement || !trimmed) return
    persistCreate({
      frameId: draftPlacement.frameId,
      route: draftPlacement.route,
      x: draftPlacement.x,
      y: draftPlacement.y,
      anchor: draftPlacement.anchor,
      body: trimmed,
      author: authorName,
    })
    setDraftPlacement(null)
    setSelectedId(null)
    refresh()
  }, [authorName, draftPlacement, refresh])

  /** Reply inside a thread: inherits the parent's frame/route/pin position and
   *  links via replyTo (the same field agent replies use). */
  const submitReply = useCallback((parentId, body) => {
    const trimmed = body.trim()
    const parent = comments.find((c) => c.id === parentId)
    if (!parent || !trimmed) return
    persistCreate({
      frameId: parent.frameId,
      route: parent.route,
      x: parent.x,
      y: parent.y,
      body: trimmed,
      author: authorName,
      replyTo: parentId,
    })
    refresh()
  }, [comments, authorName, refresh])

  const toggleResolve = useCallback((id) => {
    const c = comments.find((x) => x.id === id)
    if (!c) return
    persistUpdate(id, { status: c.status === 'open' ? 'resolved' : 'open' })
    refresh()
  }, [comments, refresh])

  const removeComment = useCallback((id) => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return
    if (persistDelete(id)) {
      setSelectedId((cur) => (cur === id ? null : cur))
      refresh()
    }
  }, [refresh])

  const selectComment = useCallback((id) => {
    setSelectedId(id)
    setDrawerOpen(true)
  }, [])

  // Escape key: exit comment mode, drop draft, or close drawer (in order).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (commentMode) {
        exitCommentMode()
        return
      }
      if (draftPlacement) {
        cancelDraft()
        return
      }
      if (drawerOpen) {
        setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commentMode, draftPlacement, drawerOpen, exitCommentMode, cancelDraft])

  /**
   * Re-resolve a frame's anchored comments against its CURRENT content.
   *
   * Called when a frame's package changes — the exact moment a positional pin
   * silently starts pointing at something else. Anything the frame cannot
   * identify comes back `orphaned` or `needsReview`; nothing is quietly moved.
   */
  const resolveFrameAnchors = useCallback(async (frameId) => {
    const anchored = listComments()
      .filter((c) => c.frameId === frameId && c.anchor)
      .map((c) => ({ id: c.id, signals: c.anchor }))
    if (anchored.length === 0) return
    const results = await resolveAnchorsInFrame(frameId, anchored)
    if (Object.keys(results).length === 0) return
    setAnchorStatus((prev) => ({ ...prev, ...results }))
  }, [])

  /**
   * Watch every frame's `src` and re-resolve when one changes.
   *
   * Deliberately keyed on src rather than on the route protocol: a rebuilt
   * package is a new src, and a package that never adopted the route snippet
   * still gets its comments re-checked. `load` covers the case where the src is
   * unchanged but the content behind it is not.
   */
  useEffect(() => {
    const seen = new Map()

    const sweep = () => {
      for (const frame of document.querySelectorAll('iframe[data-frame-id]')) {
        const frameId = frame.dataset.frameId
        const src = frame.getAttribute('src') || frame.srcdoc?.slice(0, 64) || ''
        if (!frameId || seen.get(frameId) === src) continue
        seen.set(frameId, src)
        // Let the frame mount and run its own scripts before asking it anything.
        const onReady = () => resolveFrameAnchors(frameId)
        frame.addEventListener('load', onReady, { once: true })
        // Already loaded (the listener above would never fire) — ask now.
        if (frame.contentDocument?.readyState === 'complete') onReady()
      }
    }

    sweep()
    const observer = new MutationObserver(sweep)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src'],
    })
    return () => observer.disconnect()
  }, [resolveFrameAnchors])

  const value = useMemo(() => ({
    comments,
    frameRoutes,
    commentMode,
    drawerOpen,
    selectedId,
    draftPlacement,
    authorName,
    showResolved,
    anchorStatus,
    resolveFrameAnchors,
    refresh,
    enterCommentMode,
    exitCommentMode,
    toggleCommentMode,
    placeDraftAt,
    cancelDraft,
    submitDraft,
    submitReply,
    toggleResolve,
    removeComment,
    selectComment,
    setSelectedId,
    setDrawerOpen,
    setAuthorName,
    setShowResolved,
  }), [
    comments, frameRoutes, commentMode, drawerOpen, selectedId,
    draftPlacement, authorName, showResolved, anchorStatus, resolveFrameAnchors, refresh,
    enterCommentMode, exitCommentMode, toggleCommentMode, placeDraftAt, cancelDraft,
    submitDraft, submitReply, toggleResolve, removeComment, selectComment,
    setAuthorName,
  ])

  return (
    <CommentsContext.Provider value={value}>{children}</CommentsContext.Provider>
  )
}
