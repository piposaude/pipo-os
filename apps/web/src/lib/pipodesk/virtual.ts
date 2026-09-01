import type { TicketGroup } from './group'
import type { TicketRow } from './ticket-row'

/**
 * Hand-rolled queue virtualization. Two window widths on purpose:
 * `start`/`end` include overscan (what goes to the DOM); `visibleStart`/`End`
 * are what the person actually sees. A header checkbox derived from the DOM
 * window once selected 38 rows when 21 were visible.
 */

export const ROW_HEIGHT = 44
const OVERSCAN = 8

export type VirtualRow =
  | { kind: 'group'; key: string; label: string; count: number; collapsed: boolean }
  | { kind: 'ticket'; key: string; ticket: TicketRow }

export function flattenGroups(groups: TicketGroup[], collapsed: Set<string>): VirtualRow[] {
  const rows: VirtualRow[] = []
  for (const group of groups) {
    // Grouping off yields a single unlabeled group — no header row.
    if (group.label !== '') {
      rows.push({
        kind: 'group',
        key: `group:${group.key}`,
        label: group.label,
        count: group.tickets.length,
        collapsed: collapsed.has(group.key),
      })
      if (collapsed.has(group.key)) continue
    }
    for (const ticket of group.tickets) {
      rows.push({ kind: 'ticket', key: ticket.id, ticket })
    }
  }
  return rows
}

export interface VirtualWindow {
  start: number
  end: number
  padTop: number
  padBottom: number
  visibleStart: number
  visibleEnd: number
}

export function computeWindow(
  total: number,
  viewportHeight: number,
  scrollTop: number,
): VirtualWindow {
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(total, start + visibleCount)
  const visibleStart = Math.min(total, Math.ceil(scrollTop / ROW_HEIGHT))
  const visibleEnd = Math.min(total, Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT))

  return {
    start,
    end,
    padTop: start * ROW_HEIGHT,
    padBottom: Math.max(0, (total - end) * ROW_HEIGHT),
    visibleStart,
    visibleEnd,
  }
}

/** First/last row of each contiguous selection run, so only the edges get
 *  rounded corners. A group header breaks the run. */
export function selectionEdges(
  rows: VirtualRow[],
  selected: Set<string>,
): { first: Set<string>; last: Set<string> } {
  const first = new Set<string>()
  const last = new Set<string>()
  const isSelected = (row: VirtualRow | undefined): boolean =>
    row !== undefined && row.kind === 'ticket' && selected.has(row.ticket.id)

  rows.forEach((row, index) => {
    if (row.kind !== 'ticket' || !selected.has(row.ticket.id)) return
    if (!isSelected(rows[index - 1])) first.add(row.ticket.id)
    if (!isSelected(rows[index + 1])) last.add(row.ticket.id)
  })

  return { first, last }
}
