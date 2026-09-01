import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { QueueColumn } from '@/lib/pipodesk/columns'
import type { TicketGroup } from '@/lib/pipodesk/group'
import type { TicketSort, SortField } from '@/lib/pipodesk/sort'
import { computeWindow, flattenGroups, ROW_HEIGHT } from '@/lib/pipodesk/virtual'
import constants from '@/constants/pages/pipodesk/queue'
import { QueueRow } from './QueueRow'
import styles from './Queue.module.css'

/**
 * Queue table: sticky header, virtualized body, group headers. Virtualized
 * because the node count is the whole list, not a page — paging would break
 * the sidebar invariant. `table-layout: fixed` with one `auto` column keeps
 * widths stable while scrolling.
 */
export interface QueueTableProps {
  groups: TicketGroup[]
  columns: QueueColumn[]
  sort: TicketSort
  onSort: (sort: TicketSort) => void
  collapsedGroups: string[]
  onToggleGroup: (key: string) => void
  selectedIds: string[]
  onToggleTicket: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onOpenTicket: (id: string) => void
  today: string
  resolveName: (userId: string) => string
}

/** Sortable columns. Making the rest clickable would promise a sort
 *  `sortTickets` cannot do. */
const SORTABLE: Record<string, SortField> = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  company: 'company',
  status: 'status',
  prazo: 'actionDate',
}

export function QueueTable({
  groups,
  columns,
  sort,
  onSort,
  collapsedGroups,
  onToggleGroup,
  selectedIds,
  onToggleTicket,
  onSelectAll,
  onOpenTicket,
  today,
  resolveName,
}: QueueTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => setViewportHeight(element.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const rows = flattenGroups(groups, new Set(collapsedGroups))
  const window = computeWindow(rows.length, viewportHeight, scrollTop)
  const visible = rows.slice(window.start, window.end)
  const selected = new Set(selectedIds)

  const allIds = groups.flatMap((group) => group.tickets.map((ticket) => ticket.id))
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  /* Partial selection is a third state, and it only exists as a DOM property:
     without it the header reads "nothing selected" while the batch bar counts N. */
  const someSelected = !allSelected && allIds.some((id) => selected.has(id))
  const selectAll = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = someSelected
  }, [someSelected])

  const sortOf = (key: string): 'ascending' | 'descending' | 'none' | undefined => {
    const field = SORTABLE[key]
    if (!field) return undefined
    if (sort.by !== field) return 'none'
    return sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  const toggleSort = (key: string) => {
    const field = SORTABLE[key]
    if (!field) return
    onSort({
      by: field,
      direction: sort.by === field && sort.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  // The empty state renders INSIDE the scroll box, never in its place: the box
  // holds the ref the ResizeObserver watches, and a queue that opens empty
  // would otherwise never get an observer at all.
  return (
    <div
      className={styles.scroll}
      ref={scrollRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      {rows.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>{constants.empty.title}</p>
          <p className={styles.emptySubtitle}>{constants.empty.subtitle}</p>
        </div>
      )}
      {rows.length > 0 && (
        <table className={styles.table}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) =>
                column.key === 'select' ? (
                  <th key="select" scope="col">
                    <input
                      ref={selectAll}
                      type="checkbox"
                      checked={allSelected}
                      aria-label={constants.selectAll}
                      onChange={() => onSelectAll(allSelected ? [] : allIds)}
                    />
                  </th>
                ) : (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={sortOf(column.key)}
                    className={column.align === 'right' ? styles.right : undefined}
                  >
                    {SORTABLE[column.key] ? (
                      <button
                        type="button"
                        className={styles.headerButton}
                        onClick={() => toggleSort(column.key)}
                      >
                        {column.label}
                        <span aria-hidden="true" className={styles.sortGlyph}>
                          {sortOf(column.key) === 'ascending'
                            ? '↑'
                            : sortOf(column.key) === 'descending'
                              ? '↓'
                              : '↕'}
                        </span>
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {/* The two spacers are the height of what was not rendered — they keep the
                         scrollbar sized to the whole queue. */}
            {window.padTop > 0 && (
              <tr aria-hidden="true" style={{ height: window.padTop }}>
                <td colSpan={columns.length} />
              </tr>
            )}
            {visible.map((row) =>
              row.kind === 'group' ? (
                <tr key={row.key} className={styles.groupRow}>
                  <td colSpan={columns.length}>
                    <button
                      type="button"
                      onClick={() => onToggleGroup(row.key.replace(/^group:/, ''))}
                    >
                      <span aria-hidden="true">{row.collapsed ? '▸' : '▾'}</span>
                      {row.label}
                      <span className={styles.groupCount}>{row.count}</span>
                    </button>
                  </td>
                </tr>
              ) : (
                <tr
                  key={row.key}
                  data-ticket-id={row.ticket.id}
                  data-selected={selected.has(row.ticket.id) ? 'true' : undefined}
                  /* The whole row opens the ticket, with the usual guard: a click that
                                   started on a control belongs to the control. */
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('label,input,button')) return
                    onOpenTicket(row.ticket.id)
                  }}
                >
                  <QueueRow
                    ticket={row.ticket}
                    columns={columns}
                    selected={selected.has(row.ticket.id)}
                    onToggleSelect={onToggleTicket}
                    today={today}
                    resolveName={resolveName}
                  />
                </tr>
              ),
            )}
            {window.padBottom > 0 && (
              <tr aria-hidden="true" style={{ height: window.padBottom }}>
                <td colSpan={columns.length} />
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

export { ROW_HEIGHT }
