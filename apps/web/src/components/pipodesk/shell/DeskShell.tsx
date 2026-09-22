import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { Outlet, useNavigate, useRouterState, useSearch } from '@tanstack/react-router'
import { SidebarMainLayout } from '@piposaude/design-system'
import { QueueSidebar } from '@/components/pipodesk/sidebar/QueueSidebar'
import { HOME_NODE_ID, buildTree, type TreeNode, type TreeSection } from '@/lib/pipodesk/tree'
import {
  INITIAL_VIEW,
  fromSearch,
  queueViewReducer,
  toSearch,
  type QueueSearch,
} from '@/lib/pipodesk/queue-view'
import { applyPatches, type TicketPatch } from '@/lib/pipodesk/patches'
import { SearchPalette } from '@/components/pipodesk/queue/SearchPalette'
import type { CommentChannel, TicketComment } from '@/lib/pipodesk/timeline'
import { toQueueNode } from '@/lib/pipodesk/queue-node'
import { DeskContext } from './desk-context'
import { displayNameFromEmail } from '@/lib/pipodesk/format'
import { logout } from '@/lib/auth'
import queueConstants from '@/constants/pages/pipodesk/queue'
import { useSessionStore } from '@/stores/session'
import { api, client } from '@/lib/api'
import { structureFromApi } from '@/lib/pipodesk/structure-from-api'
import { rowsFromApi } from '@/lib/pipodesk/rows-from-api'
import { businessToday } from '@/lib/date'
import { COMPANY_REGISTRY, INBOX_TICKET_IDS } from '@/fixtures/pipodesk/dataset'
import '@/styles/pipodesk-tokens.css'

/**
 * The Pipodesk shell: tree left, content right. `.desk-root` scopes the
 * operation tokens (login carries none). Rows, structure and names come from
 * the API; the inbox ids and the company registry are the last two fixtures,
 * and they leave with PD-080b and PD-054.
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

const STRUCTURE_STALE_MS = 5 * 60 * 1000

/** There is no batch route: reassigning a whole cut becomes one request per
 *  ticket, so they go a few at a time instead of all at once. */
const WRITE_CONCURRENCY = 6

/** `groupId` has no route yet (PD-052): sending it would be dropped in silence,
 *  so the move stays local and the screen keeps the button disabled. */
async function persistPatch(id: string, patch: TicketPatch): Promise<void> {
  const { status, groupId, ...fields } = patch
  void groupId

  if (Object.keys(fields).length > 0) {
    await client.PATCH('/api/tickets/{id}', { params: { path: { id } }, body: fields })
  }
  if (status !== undefined) {
    await client.PATCH('/api/tickets/{id}/status', { params: { path: { id } }, body: { status } })
  }
}

async function persistBatch(ids: string[], patch: TicketPatch): Promise<string[]> {
  const refused: string[] = []
  const queue = [...ids]

  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        await persistPatch(id, patch)
      } catch {
        refused.push(id)
      }
    }
  }

  await Promise.all(Array.from({ length: WRITE_CONCURRENCY }, worker))
  return refused
}

export function DeskShell() {
  const navigate = useNavigate()
  const user = useSessionStore((state) => state.user)
  const email = user?.email ?? ''
  const viewerName = user?.name?.trim() || (email ? displayNameFromEmail(email) : 'Você')

  /* The `sub`, not the e-mail: it is the value the API writes into assigneeId,
     so `@me` resolves against what the rows actually carry. */
  const viewerId = user?.sub ?? email

  /* The pod the person works in, not every group they answer for: coordination
     is admin in the root and in all six, and the first one would be the root. */
  const viewerGroupId = useMemo(
    () => user?.groups?.find((group) => group.role === 'member')?.groupId ?? null,
    [user],
  )

  /* The whole window, awake and sleeping: the tree splits them itself, and
     asking for one would zero "Movimentações futuras". */
  const rowsQuery = api.useQuery(
    'get',
    '/api/tickets/rows',
    { params: { query: { window: 'all' as const, limit: 5000 } } },
    { staleTime: 30_000 },
  )
  const usersQuery = api.useQuery('get', '/api/users', {}, { staleTime: STRUCTURE_STALE_MS })

  const namesByEmail = useMemo(
    () => new Map((usersQuery.data?.data ?? []).map((person) => [person.email, person.name])),
    [usersQuery.data],
  )
  const resolveName = useMemo(
    () => (userId: string) => namesByEmail.get(userId) || displayNameFromEmail(userId),
    [namesByEmail],
  )

  /* Prototype model: the base never changes; actions become patches applied
       on read. When the backend lands, the patch becomes the PATCH body. */
  const [patches, setPatches] = useState<Record<string, TicketPatch>>({})
  const today = businessToday()
  const rows = useMemo(
    () => applyPatches(rowsFromApi(rowsQuery.data?.data ?? []), patches, today),
    [rowsQuery.data, patches, today],
  )

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

  const [writeFailed, setWriteFailed] = useState(false)
  const { refetch: refetchRows } = rowsQuery

  const applyPatch = useCallback(
    (ids: string[], patch: TicketPatch) => {
      setPatches((current) => {
        const next = { ...current }
        for (const id of ids) next[id] = { ...next[id], ...patch }
        return next
      })

      void persistBatch(ids, patch).then((refused) => {
        if (refused.length === 0) return
        setPatches((current) => {
          const next = { ...current }
          for (const id of refused) delete next[id]
          return next
        })
        setWriteFailed(true)
        void refetchRows()
      })
    },
    [refetchRows],
  )

  const groupsQuery = api.useQuery(
    'get',
    '/api/groups',
    { params: { query: { pageSize: 100 } } },
    { staleTime: STRUCTURE_STALE_MS },
  )
  const queuesQuery = api.useQuery(
    'get',
    '/api/queues',
    { params: { query: { pageSize: 100 } } },
    { staleTime: STRUCTURE_STALE_MS },
  )

  const structure = useMemo(
    () => structureFromApi(groupsQuery.data?.data ?? [], queuesQuery.data?.data ?? [], viewerId),
    [groupsQuery.data, queuesQuery.data, viewerId],
  )

  const sections = useMemo(
    () =>
      buildTree(rows, {
        viewerId,
        viewerGroupId,
        structure,
        today,
        inboxTicketIds: INBOX_TICKET_IDS,
        resolveName,
      }),
    [rows, viewerId, viewerGroupId, structure, today, resolveName],
  )

  /* Open on the "Meus tickets" NODE, not a raw INITIAL_VIEW: filter, scope
       and sort come from it — rewriting them here would be a second source of
       truth. */
  const [view, dispatch] = useReducer(queueViewReducer, sections, (built: TreeSection[]) => {
    const start = findNode(built, HOME_NODE_ID)
    return start === null
      ? INITIAL_VIEW
      : queueViewReducer(INITIAL_VIEW, { type: 'select-node', node: toQueueNode(start) })
  })

  /* The link IS the view. One comparison drives both directions, so neither
     effect can chase the other: whoever is behind catches up, and stops. */
  const search = useSearch({ strict: false }) as QueueSearch
  const asLink = useMemo(() => JSON.stringify(toSearch(view)), [view])
  const onQueue = useRouterState({ select: (state) => state.location.pathname === '/' })

  useEffect(() => {
    if (!onQueue || JSON.stringify(search) === asLink) return
    const node = search.node === undefined ? null : findNode(sections, search.node)
    if (node === null) return
    dispatch({
      type: 'restore',
      view: fromSearch(search, { ...toQueueNode(node), nodeId: node.id, today }),
    })
    // `asLink` is the guard, not an input: reacting to it would restore the
    // view from the link it just produced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sections, today, onQueue])

  useEffect(() => {
    if (!onQueue || JSON.stringify(search) === asLink) return
    void navigate({ to: '/', search: JSON.parse(asLink) as QueueSearch, replace: true })
  }, [asLink, search, navigate, onQueue])

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
      void navigate({ to: '/' })
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
  const rowsTotal = rowsQuery.data?.total ?? 0

  const context = useMemo(
    () => ({
      sections,
      view,
      dispatch,
      structure,
      viewerGroupId,
      rows,
      today,
      applyPatch,
      rowsTotal,
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
      structure,
      viewerGroupId,
      rows,
      applyPatch,
      rowsTotal,
      comments,
      addComment,
      viewerId,
      today,
      resolveName,
      sidebarCollapsed,
      toggleSidebar,
    ],
  )

  return (
    <DeskContext.Provider value={context}>
      <div className="desk-root">
        {writeFailed && (
          <p role="alert" className="desk-write-failed">
            {queueConstants.writeFailed}
            <button type="button" onClick={() => setWriteFailed(false)}>
              {queueConstants.dismiss}
            </button>
          </p>
        )}
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
              structure={structure}
              viewerInitials={iniciaisDe(viewerName)}
              viewerName={viewerName}
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
            companies={COMPANY_REGISTRY}
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
