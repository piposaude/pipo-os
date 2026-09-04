/**
 * The sidebar tree: three sections, the personal cuts, favorites and the team
 * structure (ported from the prototype). Adaptations are data-source only:
 * operates on `TicketRow`, `today` by parameter, names via `resolveName`
 * (PD-060), inbox ids handed in (PD-109).
 *
 * The invariant this module exists to keep: a node's count equals the list the
 * screen builds when selecting it. Every count comes from the same alive+awake
 * base (future moves are its complement) — counting each node over a different
 * base is how the illegitimate subtraction is born.
 */

import { businessDay } from '@/lib/date'
import { API_STATUSES, type ApiStatus } from './status'
import { applyFilter, sinceOf, windowOf, type TicketFilter, type WindowMode } from './filter'
import { DEFAULT_SORT, type TicketSort } from './sort'
import type { GroupBy } from './group'
import { analystsOf, childGroupsOf, rootGroupOf, type Group } from './permissions'
import {
  favoriteQueuesOf,
  queuesOf,
  unallocatedCompanyIdsOf,
  type Queue,
  type StructureState,
} from './structure'
import { tallyPods, type PodTally } from './tally'
import type { TicketRow } from './ticket-row'

export const FUTURE_NODE_ID = 'node-futuras'

/** The triage node — tickets of companies with no portfolio. Exported so the
 *  queue knows it is there: the only place "move to portfolio" makes sense. */
export const TRIAGE_NODE_ID = 'node-triagem'

/** Prefix of the synthetic search nodes. Node identity is tree business. */
export const SEARCH_NODE_PREFIX = 'search-'

export const isSearchNode = (nodeId: string): boolean => nodeId.startsWith(SEARCH_NODE_PREFIX)

/** Prefix of nodes Favorites builds from a subscribed view. */
export const FAVORITE_NODE_PREFIX = 'fav-'

export const isFavoriteNode = (nodeId: string): boolean => nodeId.startsWith(FAVORITE_NODE_PREFIX)

export const sourceQueueIdOf = (nodeId: string): string | null =>
  nodeId.startsWith(FAVORITE_NODE_PREFIX) ? nodeId.slice(FAVORITE_NODE_PREFIX.length) : null

export interface TreeNode {
  id: string
  label: string
  count: number
  /** Five levels: GEBEN(0) › views/pods(1–2) › pod items(3) › analyst(4).
   *  Closed union on purpose — a new depth is a navigation decision. */
  depth: 0 | 1 | 2 | 3 | 4
  /** Group scope. `null` = the whole org. `TicketFilter` has no group field,
   *  so the scope lives here and cuts the base BEFORE the filter. */
  groupId: string | null
  filter: TicketFilter
  sort: TicketSort
  groupBy?: GroupBy
  children: TreeNode[]
  /** True when the node lives in the group's always-visible band, beside the
   *  subteams (triage, future moves). Declares WHERE the row is drawn, not a
   *  counting exception. */
  structural?: boolean
  /** True when the node crosses its siblings instead of partitioning (only
   *  MOV MB). The screen draws a separator so the non-adding sum does not read
   *  as a bug. */
  crossCut: boolean
  windowMode: WindowMode
  /** Label path down to the node, inclusive — the breadcrumb. A node called
   *  "Carla Porto" does not say which cut of which pod. */
  path: string[]
}

export interface TreeSection {
  title: string
  nodes: TreeNode[]
}

export interface BuildTreeOptions {
  viewerId: string
  /** The viewer's pod comes first — it is where the person lives. */
  viewerGroupId: string | null
  structure: StructureState
  today: string
  /** Tickets with an outside message awaiting reply. Empty until PD-109. */
  inboxTicketIds?: string[]
  /** Display name. Defaults to the id itself until the users module exists. */
  resolveName?: (userId: string) => string
}

const countIn = (base: TicketRow[], filter: TicketFilter, viewerId: string): number =>
  applyFilter(base, filter, viewerId).length

/** The groupBy a saved view carries, when it does. */
const groupByOf = (queue: Queue): { groupBy?: GroupBy } =>
  queue.groupBy ? { groupBy: queue.groupBy } : {}

export function buildTree(tickets: TicketRow[], options: BuildTreeOptions): TreeSection[] {
  const { viewerId, viewerGroupId, structure, today } = options
  const inboxIds = options.inboxTicketIds ?? []
  const resolveName = options.resolveName ?? ((userId: string) => userId)

  const awake = windowOf(tickets, 'awake', today)
  const sleeping = windowOf(tickets, 'sleeping', today)

  const node = (
    partial: Omit<TreeNode, 'children' | 'crossCut' | 'windowMode' | 'path'> &
      Partial<Pick<TreeNode, 'children' | 'crossCut' | 'windowMode' | 'path'>>,
  ): TreeNode => ({
    children: [],
    crossCut: false,
    windowMode: 'awake',
    // Provisional: the final `stitch` pass overwrites with the parent prefix.
    path: [partial.label],
    ...partial,
  })

  // ── Inbox ─────────────────────────────────────────────────────────────────
  // Loose top item with a badge. Filters by id: the rule looks at events, not
  // ticket fields, and is not expressible as a TicketFilter.
  const inbox: TreeNode[] = [
    node({
      id: 'node-inbox',
      label: 'Inbox',
      count: inboxIds.length,
      depth: 0,
      groupId: null,
      filter: { ticketIds: inboxIds },
      sort: { by: 'updatedAt', direction: 'desc' },
      // Crosses the window: an HR reply on a just-closed ticket must not vanish.
      windowMode: 'all',
    }),
  ]

  // ── Meus tickets ──────────────────────────────────────────────────────────
  // The base is only what is WITH ME. Free belongs to the pod (its `Livres`
  // node) — mixing the two axes in one node is the defect the prototype undid.
  const meus = awake.filter((ticket) => ticket.assigneeId === viewerId)
  const meusEmAberto = meus.filter(
    (ticket) => ticket.status !== 'completed' && ticket.status !== 'cancelled',
  )

  /** "Novos" = created since yesterday — two calendar days. `sinceOf(1)`, not
   *  2: `createdSince` compares dates, so yesterday admits both days. */
  const novosSince = sinceOf(1, today)

  /** `urgentBy` cuts strictly, so "overdue through today" is written as
   *  "before tomorrow". */
  const tomorrow = sinceOf(-1, today)

  /** Open statuses. Without this the node would count open rows while the
   *  LIST included closed ones with an action date — the count/list divergence
   *  the invariant exists to prevent. */
  const OPEN_STATUSES: ApiStatus[] = API_STATUSES.filter(
    (status) => status !== 'completed' && status !== 'cancelled',
  )

  /** "Em espera" = waiting on someone outside. Translated by `status.ts` —
   *  this module keeps no private map. */
  const WAITING_STATUSES: ApiStatus[] = [
    'carrier-processing',
    'missing-documents',
    'incorrect-data',
  ]

  const mine = (partial: {
    id: string
    label: string
    count: number
    filter: TicketFilter
    sort?: TicketSort
    windowMode?: WindowMode
  }): TreeNode => node({ depth: 1, groupId: null, sort: DEFAULT_SORT, ...partial })

  const recortes: TreeNode[] = [
    // The cuts overlap — an urgent, fresh ticket is in both. Correct: they are
    // cuts, not a partition, and the screen promises nothing else.
    mine({
      id: 'node-urgentes',
      label: 'Urgentes',
      count: meusEmAberto.filter(
        (ticket) =>
          ticket.priority === 'urgent' ||
          (ticket.actionDate !== null && ticket.actionDate <= today),
      ).length,
      filter: { assigneeIds: ['@me'], urgentBy: tomorrow, statuses: OPEN_STATUSES },
    }),
    mine({
      id: 'node-novos',
      label: 'Novos',
      count: meusEmAberto.filter((ticket) => businessDay(ticket.createdAt) >= novosSince).length,
      filter: { assigneeIds: ['@me'], statuses: OPEN_STATUSES, createdSince: novosSince },
    }),
    mine({
      id: 'node-em-espera',
      label: 'Em espera',
      count: meusEmAberto.filter((ticket) => WAITING_STATUSES.includes(ticket.status)).length,
      filter: { assigneeIds: ['@me'], statuses: WAITING_STATUSES },
    }),
    // Both cancellation statuses together — different natures (one still needs
    // work). Last-touched-first keeps what moved on top.
    mine({
      id: 'node-cancelamentos',
      label: 'Cancelamentos',
      count: tickets.filter(
        (ticket) =>
          ticket.assigneeId === viewerId &&
          (ticket.status === 'submitted-cancellation' || ticket.status === 'cancelled'),
      ).length,
      filter: { assigneeIds: ['@me'], statuses: ['submitted-cancellation', 'cancelled'] },
      sort: { by: 'updatedAt', direction: 'desc' },
      windowMode: 'all',
    }),
    // Crosses the alive+awake window like global search: cutting by "alive"
    // would empty the very node that shows what already ended.
    mine({
      id: 'node-concluidos',
      label: 'Concluídos',
      count: tickets.filter(
        (ticket) => ticket.assigneeId === viewerId && ticket.status === 'completed',
      ).length,
      filter: { assigneeIds: ['@me'], statuses: ['completed'] },
      sort: { by: 'updatedAt', direction: 'desc' },
      windowMode: 'all',
    }),
  ]

  /** "Meus tickets" is a level-0 branch like GEBEN: clickable, counted, cuts
   *  as children. Global scope: the question is "what is with me", wherever. */
  const personal: TreeNode[] = [
    node({
      id: 'node-meus-tickets',
      label: 'Meus tickets',
      count: meus.length,
      depth: 0,
      groupId: null,
      filter: { assigneeIds: ['@me'] },
      sort: DEFAULT_SORT,
      children: recortes,
    }),
  ]

  // ── GEBEN ─────────────────────────────────────────────────────────────────
  const rootGroup = rootGroupOf(structure)
  if (rootGroup === null) {
    return [
      { title: 'Workspace', nodes: [...inbox, ...personal] },
      { title: 'Favoritos', nodes: [] },
      { title: 'Grupos', nodes: [] },
    ]
  }

  const pods = childGroupsOf(structure, rootGroup.id)
  const podTally = tallyPods(awake)

  const podNode = (pod: Group): TreeNode => {
    const inPod = awake.filter((ticket) => ticket.groupId === pod.id)
    const tally: PodTally = podTally.get(pod.id) ?? {
      total: 0,
      clt: 0,
      pj: 0,
      mb: 0,
      byAssignee: new Map(),
    }
    const analysts = analystsOf(structure, pod.id).map((membership) => membership.userId)

    /** The pod's analysts inside a cut. The cut's filter rides along
     *  (`...movFilter`) or the screen would list ALL of the analyst's tickets
     *  against the count the node announces. */
    const analystsIn = (mov: 'clt' | 'pj' | 'mb', movFilter: TicketFilter): TreeNode[] =>
      analysts.map((userId) =>
        node({
          id: `node-analyst-${pod.id}-${mov}-${userId}`,
          label: resolveName(userId),
          count: tally.byAssignee.get(userId)?.[mov] ?? 0,
          depth: 4,
          groupId: pod.id,
          filter: { ...movFilter, assigneeIds: [userId] },
          sort: DEFAULT_SORT,
        }),
      )

    /** The three MOVs are saved queues, none synthesized here: without a Queue
     *  there are no subscribers and MOV CLT could not be favorited.
     *  `undefined` when deleted — the pod shrinks instead of breaking. */
    const movQueue = (suffix: 'clt' | 'pj' | 'mb') =>
      structure.queues.find((queue) => queue.id === `queue-${pod.id}-${suffix}`)

    /** CLT and PJ partition the pod. Count comes from the tally (one sweep) —
     *  same number, kept for performance; the Queue's filter goes on screen. */
    const byContract = (type: 'clt' | 'pj'): TreeNode | null => {
      const queue = movQueue(type)
      if (!queue) return null
      return node({
        id: queue.id,
        label: queue.name,
        count: tally[type],
        depth: 3,
        groupId: pod.id,
        filter: { ...queue.filter },
        sort: queue.sort,
        children: analystsIn(type, queue.filter),
      })
    }

    const mbQueue = movQueue('mb')
    const mb = mbQueue
      ? node({
          id: mbQueue.id,
          label: mbQueue.name,
          count: tally.mb,
          depth: 3,
          groupId: pod.id,
          filter: { ...mbQueue.filter },
          sort: mbQueue.sort,
          crossCut: true,
          children: analystsIn('mb', mbQueue.filter),
        })
      : null

    const clt = byContract('clt')
    const pj = byContract('pj')

    // The three MOVs already became nodes above — keep them out to avoid duplicates.
    const movIds = new Set((['clt', 'pj', 'mb'] as const).map((mov) => `queue-${pod.id}-${mov}`))
    const queues = queuesOf(structure, pod.id)
      .filter((queue) => !movIds.has(queue.id))
      .map((queue) =>
        node({
          id: queue.id,
          label: queue.name,
          count: countIn(inPod, queue.filter, viewerId),
          depth: 3,
          groupId: pod.id,
          filter: { ...queue.filter },
          sort: queue.sort,
          ...groupByOf(queue),
        }),
      )

    /** "Livres" — the pod's unassigned tickets. One per pod, above the MOVs:
     *  free belongs to the whole pod, not to a contract type. */
    const livres = inPod.filter((ticket) => ticket.assigneeId === null)

    return node({
      id: `node-${pod.id}`,
      label: pod.name,
      count: tally.total,
      // The pod is a GEBEN subteam: at level 1 it would tie with GEBEN's own items.
      depth: 2,
      groupId: pod.id,
      filter: {},
      sort: DEFAULT_SORT,
      children: [
        /** "Chamados" — the pod's full list. The count lives here, on a node that
         *  OPENS what it promises; the pod node is a container. */
        node({
          id: `node-${pod.id}-chamados`,
          label: 'Chamados',
          count: tally.total,
          depth: 3,
          groupId: pod.id,
          filter: {},
          sort: DEFAULT_SORT,
        }),
        node({
          id: `node-${pod.id}-livres`,
          label: 'Livres',
          count: livres.length,
          depth: 3,
          groupId: pod.id,
          filter: { assigneeIds: [null] },
          sort: DEFAULT_SORT,
        }),
        ...queues,
        ...(clt ? [clt] : []),
        ...(pj ? [pj] : []),
        ...(mb ? [mb] : []),
      ],
    })
  }

  // Viewer's pod first — it is where the person lives.
  const orderedPods = [
    ...pods.filter((pod) => pod.id === viewerGroupId),
    ...pods.filter((pod) => pod.id !== viewerGroupId),
  ]

  const rootQueues = queuesOf(structure, rootGroup.id).map((queue) =>
    node({
      id: queue.id,
      label: queue.name,
      count: countIn(awake, queue.filter, viewerId),
      depth: 1,
      groupId: null,
      filter: { ...queue.filter },
      sort: queue.sort,
      ...groupByOf(queue),
    }),
  )

  /* ── Triage ───────────────────────────────────────────────────────────────
   * Tickets of companies with no portfolio, still in the root group. Both
   * halves of the cut pay a bill: root-only would mix in escalated tickets;
   * company-only would make triage never end (moving the ticket does not
   * portfolio the company, so the row would match again). Disappears at zero —
   * a debt node showing 0 is noise. */
  const semCarteira = unallocatedCompanyIdsOf(structure, [
    ...new Set(tickets.map((ticket) => ticket.companyId)),
  ])
  const triagemFilter: TicketFilter = { companyIds: semCarteira, archived: false }
  const naRaiz = awake.filter((ticket) => ticket.groupId === rootGroup.id)
  const triagem: TreeNode[] =
    semCarteira.length === 0
      ? []
      : [
          node({
            id: TRIAGE_NODE_ID,
            label: 'Triagem',
            // Counted over the scope-cut base, as the screen cuts: the invariant.
            count: countIn(naRaiz, triagemFilter, viewerId),
            depth: 2,
            structural: true,
            groupId: rootGroup.id,
            filter: triagemFilter,
            // Oldest first: in triage what hurts is what waited longest, and
            // actionDate is null exactly on what nobody touched.
            sort: { by: 'createdAt', direction: 'asc' },
          }),
        ]

  /* ── Future moves ─────────────────────────────────────────────────────────
   * The only place sleepers appear: 'sleeping' inverts the window. GEBEN child
   * at pod level — a future move becomes a move, same queue at another time.
   * Scope null, unlike triage: there is no gesture that clears a row here;
   * time passes and it wakes on its own. */
  const future: TreeNode[] = [
    node({
      id: FUTURE_NODE_ID,
      label: 'Movimentações futuras',
      count: sleeping.length,
      depth: 2,
      structural: true,
      groupId: null,
      filter: {},
      sort: { by: 'actionDate', direction: 'asc' },
      groupBy: 'none',
      windowMode: 'sleeping',
    }),
  ]

  /** Display label diverges from the real name in one node: "Gestão de
   *  Benefícios" shows as GEBEN — the everyday name, and it fits the sidebar.
   *  The DATA does not change; the breadcrumb follows the short form for free. */
  const rootLabel = rootGroup.name === 'Gestão de Benefícios' ? 'GEBEN' : rootGroup.name

  const geben: TreeNode[] = [
    node({
      id: `node-${rootGroup.id}`,
      label: rootLabel,
      count: awake.length,
      depth: 0,
      groupId: null,
      filter: {},
      // Inherited from the absorbed "Todos" view — not the tree default. Without
      // it, "Todos" users would silently lose last-touched ordering.
      sort: { by: 'updatedAt', direction: 'desc' },
      /* Triage first and future moves last, pods in between: today's debt opens
               the list, tomorrow's window closes it. */
      children: [...triagem, ...rootQueues, ...orderedPods.map(podNode), ...future],
    }),
  ]

  // ── Favorites ─────────────────────────────────────────────────────────────
  // Favoriting = subscribing (`Queue.subscriberIds`, no new field). The section
  // opens empty until the first star. A favorite is a COPY with a prefixed id
  // (duplicate ids would break selection); count/filter/scope/window come from
  // the original, never recomputed — recomputing broke the invariant before.
  const byId = new Map<string, TreeNode>()
  const index = (list: TreeNode[]): void => {
    for (const item of list) {
      byId.set(item.id, item)
      index(item.children)
    }
  }
  index(geben)

  const favorites: TreeNode[] = favoriteQueuesOf(structure, viewerId).flatMap((queue) => {
    const source = byId.get(queue.id)
    // A subscribed queue that is not a node cannot be a favorite: a shortcut to nowhere.
    if (!source) return []
    return [node({ ...source, id: `${FAVORITE_NODE_PREFIX}${queue.id}`, depth: 0, children: [] })]
  })

  /** Stitches paths top-down in one pass after the tree is built — doing it
   *  during construction would require every node builder to know its parent
   *  path, and one would silently fall behind. */
  const stitch = (nodes: TreeNode[], prefix: string[]): void => {
    for (const item of nodes) {
      item.path = [...prefix, item.label]
      stitch(item.children, item.path)
    }
  }
  stitch(inbox, [])
  stitch(personal, [])
  stitch(favorites, [])
  stitch(geben, [])

  return [
    // Inbox and Meus tickets share the block: both are what arrived for THIS person.
    { title: 'Workspace', nodes: [...inbox, ...personal] },
    { title: 'Favoritos', nodes: favorites },
    { title: 'Grupos', nodes: geben },
  ]
}

/** Top-bar pills: the active node's siblings. A node WITH children returns
 *  its children ("what is inside this"), not its siblings; a childless
 *  top-level node returns nothing (Inbox would drag Meus tickets along). */
export function pillsOf(sections: TreeSection[], nodeId: string): TreeNode[] {
  const walk = (nodes: TreeNode[]): TreeNode[] | null => {
    for (const current of nodes) {
      if (current.id === nodeId) return current.children.length > 0 ? current.children : nodes
      const found = walk(current.children)
      if (found) return found
    }
    return null
  }

  for (const section of sections) {
    const found = walk(section.nodes)
    if (found) return found.some((item) => item.id === nodeId && item.depth === 0) ? [] : found
  }
  return []
}
