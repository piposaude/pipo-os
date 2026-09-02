import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { SidebarMainLayout } from '@piposaude/design-system'
import { QueueSidebar } from '@/components/pipodesk/sidebar/QueueSidebar'
import { buildTree, type TreeNode, type TreeSection } from '@/lib/pipodesk/tree'
import { INITIAL_VIEW, queueViewReducer } from '@/lib/pipodesk/queue-view'
import { applyPatches, type TicketPatch } from '@/lib/pipodesk/patches'
import { SearchPalette } from '@/components/pipodesk/queue/SearchPalette'
import type { CommentChannel, TicketComment } from '@/lib/pipodesk/timeline'
import { toQueueNode } from '@/lib/pipodesk/queue-node'
import { DeskContext } from './desk-context'
import { displayNameFromEmail } from '@/lib/pipodesk/format'
import { logout } from '@/lib/auth'
import { useSessionStore } from '@/stores/session'
import {
  DATASET_TODAY,
  FIXTURE_USER_NAMES,
  INBOX_TICKET_IDS,
  queueSeed,
  structureFixture,
  VIEWER_GROUP_ID,
  VIEWER_ID,
} from '@/fixtures/pipodesk/dataset'
import '@/styles/pipodesk-tokens.css'

/**
 * The Pipodesk shell: tree left, content right. `.desk-root` scopes the
 * operation tokens (login carries none). The base is still a fixture —
 * swapping in the API (PD-043/PD-050) changes the source of `rows`, not the
 * shape.
 */
/** Node by id, at any depth of the three sections. */
function findNode(sections: TreeSection[], id: string): TreeNode | null {
  const walk = (nodes: TreeNode[]): TreeNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node
      const found = walk(node.children)
      if (found) return found
    }
    return null
  }
  for (const section of sections) {
    const found = walk(section.nodes)
    if (found) return found
  }
  return null
}

/** Global key, not per person: collapsing the menu is a preference of the
 *  screen space, not of the account. */
const SIDEBAR_KEY = 'pipodesk:sidebar-collapsed'

const iniciaisDe = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

export function DeskShell() {
  const navigate = useNavigate()
  const email = useSessionStore((state) => state.user?.email) ?? ''
  const viewerName = email ? displayNameFromEmail(email) : 'Você'

  /* Dataset viewer, not the session e-mail: pointing `@me` at an e-mail that
       appears in no row would zero "Meus tickets". Leaves with PD-101. */
  const viewerId = VIEWER_ID

  const resolveName = useMemo(
    () => (userId: string) => FIXTURE_USER_NAMES[userId] ?? displayNameFromEmail(userId),
    [],
  )

  /* Prototype model: the base never changes; actions become patches applied
       on read. When the backend lands, the patch becomes the PATCH body. */
  const [patches, setPatches] = useState<Record<string, TicketPatch>>({})
  const rows = useMemo(() => applyPatches(queueSeed, patches, DATASET_TODAY), [patches])

  const [comments, setComments] = useState<TicketComment[]>([])
  const addComment = useCallback(
    (ticketId: string, channel: CommentChannel, body: string) => {
      setComments((current) => [
        ...current,
        {
          id: `local-${current.length + 1}`,
          ticketId,
          channel,
          body,
          at: new Date().toISOString(),
          author: email || 'você',
        },
      ])
    },
    [email],
  )

  const applyPatch = useCallback((ids: string[], patch: TicketPatch) => {
    setPatches((current) => {
      const next = { ...current }
      for (const id of ids) next[id] = { ...next[id], ...patch }
      return next
    })
  }, [])

  const sections = useMemo(
    () =>
      buildTree(rows, {
        viewerId,
        viewerGroupId: VIEWER_GROUP_ID,
        structure: structureFixture,
        today: DATASET_TODAY,
        inboxTicketIds: INBOX_TICKET_IDS,
        resolveName,
      }),
    [rows, viewerId, resolveName],
  )

  /* Open on the "Meus tickets" NODE, not a raw INITIAL_VIEW: filter, scope
       and sort come from it — rewriting them here would be a second source of
       truth. */
  const [view, dispatch] = useReducer(queueViewReducer, sections, (built: TreeSection[]) => {
    const start = findNode(built, 'node-meus-tickets')
    return start === null
      ? INITIAL_VIEW
      : queueViewReducer(INITIAL_VIEW, { type: 'select-node', node: toQueueNode(start) })
  })

  /* Survives reloads. `localStorage` may throw (private window); a layout
       preference must not keep the queue from opening. */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, String(!collapsed))
      } catch {
        // No persistence available: the session still honors the choice.
      }
      return !collapsed
    })
  }, [])

  const [searchOpen, setSearchOpen] = useState(false)

  /* ⌘B and ⌘K on the document: the gestures work from anywhere, focus in the
       table included. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'b') {
        event.preventDefault()
        toggleSidebar()
      } else if (key === 'k') {
        event.preventDefault()
        setSearchOpen((current) => !current)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  /* Selecting a node means going to the queue: dispatch, then navigate. The
       state lives in this shell, above the routes, so it survives navigation —
       without the navigate, a click from the detail or team page looked dead. */
  const selectNode = useCallback(
    (node: TreeNode) => {
      dispatch({ type: 'select-node', node: toQueueNode(node) })
      navigate({ to: '/' })
    },
    [dispatch, navigate],
  )

  /* `async` behind a `() => void` prop would leave the promise floating — the
     repo's eslint is not type-checked, so nothing would catch it. */
  const handleLogout = () => {
    void logoutAndLeave()
  }

  const logoutAndLeave = async () => {
    // Navigate even if the request fails: the person asked to leave, and
    // staying on the queue with no feedback is worse than a stale server session.
    try {
      await logout()
    } catch {
      // The store already drops the local session when the request fails.
    }
    navigate({ to: '/login' })
  }

  /* Memoized: the shell sits above every screen of the desk, so a new object
     here rerenders all of them on any state change. */
  const context = useMemo(
    () => ({
      sections,
      view,
      dispatch,
      rows,
      today: DATASET_TODAY,
      applyPatch,
      comments,
      addComment,
      viewerId,
      resolveName,
      sidebarCollapsed,
      toggleSidebar,
    }),
    [
      sections,
      view,
      dispatch,
      rows,
      applyPatch,
      comments,
      addComment,
      viewerId,
      resolveName,
      sidebarCollapsed,
      toggleSidebar,
    ],
  )

  return (
    <DeskContext.Provider value={context}>
      <div className="desk-root">
        <SidebarMainLayout
          sidebarWidth={sidebarCollapsed ? '0px' : 'var(--sidebar-w)'}
          sidebar={
            // Always mounted, hidden when collapsed: the tree keeps which nodes
            // are open instead of reopening at the default after every ⌘B.
            <QueueSidebar
              collapsed={sidebarCollapsed}
              sections={sections}
              activeId={view.nodeId}
              onSelect={selectNode}
              structure={structureFixture}
              viewerInitials={iniciaisDe(FIXTURE_USER_NAMES[viewerId] ?? viewerName)}
              viewerName={FIXTURE_USER_NAMES[viewerId] ?? viewerName}
              viewerEmail={email}
              onLogout={handleLogout}
              onOpenSearch={() => setSearchOpen(true)}
            />
          }
          main={
            // `div`, not `main`: the DS layout already renders the `<main>` — nesting
            // would be invalid HTML. The skip-link target lives here (PD-314).
            <div id="conteudo">
              <Outlet />
            </div>
          }
        />
        {/* Mounted only while open: closing unmounts, so reopening resets query and
            cursor without an effect. */}
        {searchOpen && (
          <SearchPalette
            open
            onClose={() => setSearchOpen(false)}
            rows={rows}
            sections={sections}
            onSelect={(node) => {
              dispatch({ type: 'select-node', node })
              navigate({ to: '/' })
            }}
          />
        )}
      </div>
    </DeskContext.Provider>
  )
}
