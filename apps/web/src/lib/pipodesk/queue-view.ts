import type { FilterField, TicketFilter, WindowMode } from './filter'
import type { GroupBy } from './group'
import { DEFAULT_SORT, type SortField, type TicketSort } from './sort'
import type { Priority } from './ticket-row'

/**
 * Queue view state and its URL round trip. It lives in the URL so back works
 * and a queue link can be shared; transient state (selection) and machine
 * preferences (columns) stay out. `nodeFilter` is kept apart from `filter` so
 * the chip row only shows what the person added on top of the node.
 */

export interface QueueNode {
  id: string
  label: string
  filter: TicketFilter
  /** Group scope of the node. `null` = the whole operation. Cuts the base
   *  BEFORE the filter, or sidebar count and list disagree. */
  groupId: string | null
  windowMode: WindowMode
  labelPath: string[]
  /** The sort the node declares — triage opens oldest-first, GEBEN by last
   *  touch, the rest by deadline. */
  sort: TicketSort
  /** Grouping imposed by the node. Absent = the person's choice stands. */
  groupBy?: GroupBy
}

export interface QueueView {
  nodeId: string
  label: string
  groupId: string | null
  windowMode: WindowMode
  /** Effective filter: the node's plus whatever the person added. */
  filter: TicketFilter
  /** Only what the node brought. */
  nodeFilter: TicketFilter
  sort: TicketSort
  groupBy: GroupBy
  labelPath: string[]
  collapsedGroups: string[]
  selectedIds: string[]
  /** "Opened in" window in days; `null` = whole period. The screen applies it
   *  on the base, before the filter. */
  dateWindowDays: number | null
}

export const INITIAL_VIEW: QueueView = {
  nodeId: 'meus-tickets',
  label: 'Meus tickets',
  groupId: null,
  windowMode: 'awake',
  filter: { assigneeIds: ['@me'] },
  nodeFilter: { assigneeIds: ['@me'] },
  sort: DEFAULT_SORT,
  // No grouping by default: sidebar and breadcrumb already state the context.
  groupBy: 'none',
  labelPath: ['Meus tickets'],
  collapsedGroups: [],
  selectedIds: [],
  /** 30-day window on by default, like the prototype — a measured cost
   *  (7,600 → 2,598 open), not an accident. */
  dateWindowDays: 30,
}

export type QueueAction =
  | { type: 'select-node'; node: QueueNode }
  | { type: 'add-filter'; field: FilterField; values: string[] }
  | { type: 'remove-filter'; field: FilterField }
  | { type: 'clear-filters' }
  | { type: 'set-date-window'; days: number | null; today: string }
  | { type: 'set-sort'; sort: TicketSort }
  | { type: 'set-group-by'; groupBy: GroupBy }
  | { type: 'toggle-group'; key: string }
  | { type: 'toggle-ticket'; id: string }
  | { type: 'set-selection'; ids: string[] }
  | { type: 'clear-selection' }

/** `'livre'` and `'sem'` are display sentinels for `null`, translated at the
 *  UI/filter boundary. */
function decodeValues(field: FilterField, values: string[]): unknown[] {
  if (field === 'assigneeIds') return values.map((value) => (value === 'livre' ? null : value))
  if (field === 'priorities' || field === 'contractTypes')
    return values.map((value) => (value === 'sem' ? null : value))
  return values
}

/** URLs are hand-editable: a stray `%` must not blow up the restore. */
function unescapeValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function encodeValues(field: FilterField, values: unknown[]): string[] {
  // Free strings (tags) may carry `,` `;` `:` — the codec's own separators.
  const escape = (value: unknown): string => encodeURIComponent(String(value))
  if (field === 'assigneeIds')
    return values.map((value) => (value === null ? 'livre' : escape(value)))
  if (field === 'priorities' || field === 'contractTypes')
    return values.map((value) => (value === null ? 'sem' : escape(value)))
  return values.map(escape)
}

const withoutField = (filter: TicketFilter, field: FilterField): TicketFilter => {
  const next = { ...filter }
  delete next[field]
  return next
}

export function queueViewReducer(view: QueueView, action: QueueAction): QueueView {
  switch (action.type) {
    case 'select-node': {
      const { node } = action
      return {
        ...view,
        nodeId: node.id,
        label: node.label,
        groupId: node.groupId,
        windowMode: node.windowMode,
        filter: { ...node.filter },
        nodeFilter: { ...node.filter },
        sort: node.sort,
        // The node only overrides grouping when it imposes one: switching queues
        // must not silently undo the person's choice.
        groupBy: node.groupBy ?? view.groupBy,
        labelPath: node.labelPath,
        collapsedGroups: [],
        selectedIds: [],
        // The window survives: it is the viewer's preference and crosses queues.
        dateWindowDays: view.dateWindowDays,
      }
    }
    case 'add-filter':
      return {
        ...view,
        filter: {
          ...view.filter,
          [action.field]: decodeValues(action.field, action.values),
        } as TicketFilter,
      }
    case 'remove-filter': {
      const cleared = withoutField(view.filter, action.field)
      const fromNode = view.nodeFilter[action.field]
      return {
        ...view,
        filter:
          fromNode === undefined
            ? cleared
            : ({ ...cleared, [action.field]: fromNode } as TicketFilter),
      }
    }
    // The window survives here too: it is the viewer's preference, not a chip.
    case 'clear-filters':
      return { ...view, filter: { ...view.nodeFilter } }
    // Store only the number: the screen applies the window on the base. Baking
    // it into `filter.createdSince` would make it a removable chip. Selection
    // clears because marked rows may have left the screen.
    case 'set-date-window':
      return { ...view, dateWindowDays: action.days, selectedIds: [] }
    case 'set-sort':
      return { ...view, sort: action.sort }
    case 'set-group-by':
      return { ...view, groupBy: action.groupBy, collapsedGroups: [] }
    case 'toggle-group':
      return {
        ...view,
        collapsedGroups: view.collapsedGroups.includes(action.key)
          ? view.collapsedGroups.filter((key) => key !== action.key)
          : [...view.collapsedGroups, action.key],
      }
    case 'toggle-ticket':
      return {
        ...view,
        selectedIds: view.selectedIds.includes(action.id)
          ? view.selectedIds.filter((id) => id !== action.id)
          : [...view.selectedIds, action.id],
      }
    case 'set-selection':
      return { ...view, selectedIds: action.ids }
    case 'clear-selection':
      return { ...view, selectedIds: [] }
  }
}

/* ── URL ───────────────────────────────────────────────────────────────────── */

export interface QueueSearch {
  node?: string
  /** Only the fields the person added: `products:life,health;companySizes:pme`. */
  f?: string
  sort?: SortField
  dir?: 'asc' | 'desc'
  group?: GroupBy
  win?: number
}

const CODEC_FIELDS: Record<FilterField, true> = {
  statuses: true,
  companyIds: true,
  carrierIds: true,
  products: true,
  types: true,
  companySizes: true,
  contractTypes: true,
  relationships: true,
  origins: true,
  groupIds: true,
  tags: true,
  assigneeIds: true,
  priorities: true,
}

const FILTER_FIELDS = Object.keys(CODEC_FIELDS) as FilterField[]

const isArrayField = (value: unknown): value is unknown[] => Array.isArray(value)

/** Serializes only the delta between effective and node filter. */
export function toSearch(view: QueueView): QueueSearch {
  const parts: string[] = []
  for (const field of FILTER_FIELDS) {
    const current = view.filter[field]
    const fromNode = view.nodeFilter[field]
    if (!isArrayField(current) || current.length === 0) continue
    if (JSON.stringify(current) === JSON.stringify(fromNode)) continue
    parts.push(`${field}:${encodeValues(field, current).join(',')}`)
  }

  const search: QueueSearch = { node: view.nodeId }
  if (parts.length > 0) search.f = parts.join(';')
  if (view.sort.by !== DEFAULT_SORT.by) search.sort = view.sort.by
  if (view.sort.direction !== DEFAULT_SORT.direction) search.dir = view.sort.direction
  if (view.groupBy !== 'none') search.group = view.groupBy
  // Default (30) stays out of the URL; `win=0` encodes "whole period" since
  // absence already means the default.
  if (view.dateWindowDays !== 30) search.win = view.dateWindowDays ?? 0
  return search
}

export interface RestoreContext extends Omit<QueueNode, 'id'> {
  nodeId: string
  today: string
}

/**
 * Rebuilds the view from URL params. Needs the node because the node filter is
 * derived from the tree, not duplicated in the link. Malformed params are
 * ignored, never fatal.
 */
export function fromSearch(search: QueueSearch, context: RestoreContext): QueueView {
  const added: TicketFilter = {}

  for (const chunk of (search.f ?? '').split(';')) {
    const [field, rawValues] = chunk.split(':')
    if (!field || !rawValues) continue
    if (!FILTER_FIELDS.includes(field as FilterField)) continue
    const values = rawValues
      .split(',')
      .filter((value) => value !== '')
      .map(unescapeValue)
    if (values.length === 0) continue
    Object.assign(added, {
      [field]: decodeValues(field as FilterField, values),
    })
  }

  const filter: TicketFilter = { ...context.filter, ...added }
  // Absent = default (30); `win=0` = whole period.
  const dateWindowDays =
    typeof search.win === 'number' && Number.isFinite(search.win)
      ? search.win === 0
        ? null
        : search.win
      : 30

  return {
    nodeId: context.nodeId,
    label: context.label,
    groupId: context.groupId,
    windowMode: context.windowMode,
    filter,
    nodeFilter: { ...context.filter },
    // Fall back to the node's own sort/grouping, not the app default: a shared
    // link must open like a tree click would.
    sort: {
      by: search.sort ?? context.sort.by,
      direction: search.dir ?? context.sort.direction,
    },
    groupBy: search.group ?? context.groupBy ?? 'none',
    labelPath: context.labelPath,
    collapsedGroups: [],
    selectedIds: [],
    dateWindowDays,
  }
}

export type { Priority }
