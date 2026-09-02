/**
 * Queue columns: which exist, which show, in what order and width. Preferences
 * keep the order of ALL keys, not only visible ones — the owner column comes
 * and goes with the filter and must return to its chosen spot.
 */

export interface QueueColumn {
  key: string
  label: string
  /** `'auto'` only for the flexible column. */
  width: string
  align?: 'left' | 'right'
}

/** The select column never hides or moves. */
export const FIXED_COLUMN = 'select'

/** The column that absorbs leftover width. Fixing it would leave the table
 *  with no elastic element. */
export const FLEX_COLUMN = 'subject'

/** Below this the column no longer fits its own header label. */
export const MIN_COLUMN_WIDTH = 64

export const ALL_COLUMN_KEYS = [
  'id',
  'assignee',
  'subject',
  'classification',
  'relationship',
  'company',
  'status',
  'createdAt',
  'updatedAt',
  'prazo',
]

export interface ColumnPrefs {
  hidden: string[]
  /** Widths in px, only for columns the person resized. */
  widths: Record<string, number>
  /** Preferred order of ALL keys. */
  order: string[]
}

/** Defaults hide createdAt/updatedAt: they exist for freshness triage only. */
export const DEFAULT_COLUMN_PREFS: ColumnPrefs = {
  hidden: ['createdAt', 'updatedAt'],
  order: ALL_COLUMN_KEYS,
  widths: {},
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

/**
 * Stored preferences, field by field. Valid JSON in the wrong shape used to
 * throw on every render, and the error screen's "reload" read the same storage
 * back — the person had no way out through the interface.
 */
export function readColumnPrefs(stored: unknown): ColumnPrefs {
  if (stored === null || typeof stored !== 'object') return DEFAULT_COLUMN_PREFS
  const raw = stored as Partial<Record<keyof ColumnPrefs, unknown>>
  const widths = raw.widths

  return {
    hidden: isStringArray(raw.hidden) ? raw.hidden : DEFAULT_COLUMN_PREFS.hidden,
    order: isStringArray(raw.order) ? raw.order : DEFAULT_COLUMN_PREFS.order,
    widths:
      typeof widths === 'object' && widths !== null && !Array.isArray(widths)
        ? Object.fromEntries(
            Object.entries(widths).filter(([, value]) => typeof value === 'number'),
          )
        : {},
  }
}

/** True when the columns no longer match the default set — the panel lights a
 *  dot. Compared as a set: swapping one hidden column for another keeps the
 *  count and still is a custom display. */
export function hasCustomColumns(hidden: string[]): boolean {
  const base = new Set(DEFAULT_COLUMN_PREFS.hidden)
  return hidden.length !== base.size || hidden.some((key) => !base.has(key))
}

export const isResizable = (key: string): boolean => key !== FIXED_COLUMN && key !== FLEX_COLUMN

/** Base layout. `showAssignee` is false when the queue is pinned to one
 *  owner — repeating the same face wastes width. */
export const columnsFor = (showAssignee: boolean): QueueColumn[] =>
  [
    { key: 'select', label: '', width: '36px' },
    { key: 'id', label: 'ID.', width: '84px' },
    ...(showAssignee ? [{ key: 'assignee', label: 'Dono', width: '64px' }] : []),
    { key: 'subject', label: 'Assunto', width: 'auto' },
    { key: 'classification', label: 'Classificação', width: '132px' },
    { key: 'relationship', label: 'Vínculo', width: '104px' },
    { key: 'company', label: 'Empresa', width: '190px' },
    { key: 'status', label: 'Status', width: '150px' },
    { key: 'createdAt', label: 'Criação', width: '110px' },
    { key: 'updatedAt', label: 'Parado', width: '110px' },
    { key: 'prazo', label: 'Prazo', width: '86px', align: 'right' },
  ] satisfies QueueColumn[]

export function applyColumnPrefs(base: QueueColumn[], prefs: ColumnPrefs): QueueColumn[] {
  const hidden = new Set(prefs.hidden.filter((key) => key !== FIXED_COLUMN))
  const rank = new Map<string, number>()
  // First occurrence wins: a duplicated key in old storage must not reorder the table.
  prefs.order.forEach((key, index) => {
    if (!rank.has(key)) rank.set(key, index)
  })

  return base
    .filter((column) => !hidden.has(column.key))
    .sort((a, b) => {
      if (a.key === FIXED_COLUMN) return -1
      if (b.key === FIXED_COLUMN) return 1
      return (
        (rank.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.key) ?? Number.MAX_SAFE_INTEGER)
      )
    })
    .map((column) => {
      const dragged = prefs.widths[column.key]
      if (dragged === undefined || !isResizable(column.key)) return column
      return { ...column, width: `${Math.max(MIN_COLUMN_WIDTH, dragged)}px` }
    })
}

/**
 * Moves `key` one step counting only currently visible columns. Swapping in
 * the full list looks equivalent but is not: a hidden neighbor would make the
 * swap a silent no-op on screen.
 */
export function moveColumn(
  order: string[],
  visible: string[],
  key: string,
  direction: -1 | 1,
): string[] {
  const onScreen = new Set(visible)
  const from = order.indexOf(key)
  if (from === -1 || !onScreen.has(key)) return order

  // Walk until the next key that is actually on screen.
  let neighbour = from + direction
  while (neighbour >= 0 && neighbour < order.length && !onScreen.has(order[neighbour])) {
    neighbour += direction
  }
  if (neighbour < 0 || neighbour >= order.length) return order

  // Shift, do not swap: swapping would throw a hidden in-between column to
  // the other side. Shifting keeps its neighbors so it reappears where it was.
  const next = order.filter((candidate) => candidate !== key)
  const at = next.indexOf(order[neighbour])
  next.splice(direction === 1 ? at + 1 : at, 0, key)
  return next
}
