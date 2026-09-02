import type { DisplayStatus } from './status'
import type { TicketRow } from './ticket-row'

/**
 * Queue sorting. `actionDate` has two rules that never flip with direction:
 * null dates always sink to the end, tie-broken by `updatedAt` asc (most
 * forgotten first). Only real-date comparisons invert.
 */

export type SortField = 'actionDate' | 'createdAt' | 'updatedAt' | 'company' | 'status'

export interface TicketSort {
  by: SortField
  direction: 'asc' | 'desc'
}

export const DEFAULT_SORT: TicketSort = { by: 'actionDate', direction: 'asc' }

/**
 * Triage order for the Status column — whose ball it is, in attack order.
 * Deliberately different from the canonical order group headers use.
 *
 * A `Record`, not an array with `satisfies`: `satisfies` only checks that each
 * entry IS a `DisplayStatus`, so a seventh status would compile and sort at
 * rank 0 — top of the queue, silently. This way the compiler asks for it.
 */
const TRIAGE_ORDER: Record<DisplayStatus, number> = {
  'broker-processing': 0,
  'client-pending': 1,
  'carrier-processing': 2,
  'submitted-cancellation': 3,
  completed: 4,
  cancelled: 5,
}

export const TRIAGE_RANK = new Map<DisplayStatus, number>(
  Object.entries(TRIAGE_ORDER).map(([status, rank]) => [status as DisplayStatus, rank]),
)

type PlainSortField = Exclude<SortField, 'actionDate'>

function comparePlain(a: TicketRow, b: TicketRow, by: PlainSortField): number {
  switch (by) {
    case 'createdAt':
      return a.createdAt.localeCompare(b.createdAt)
    case 'updatedAt':
      return a.updatedAt.localeCompare(b.updatedAt)
    case 'company':
      return (a.companyName ?? '').localeCompare(b.companyName ?? '', 'pt-BR')
    case 'status':
      return TRIAGE_ORDER[a.display] - TRIAGE_ORDER[b.display]
  }
}

export function sortTickets(tickets: TicketRow[], sort: TicketSort): TicketRow[] {
  const factor = sort.direction === 'desc' ? -1 : 1
  /* Code-point order, not `localeCompare`: the tie-break has to be the same on
     every machine, and collation is locale-dependent. */
  const byId = (a: TicketRow, b: TicketRow): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const by = sort.by

  if (by === 'actionDate') {
    return [...tickets].sort((a, b) => {
      if (a.actionDate === null && b.actionDate === null) {
        return a.updatedAt.localeCompare(b.updatedAt) || byId(a, b)
      }
      if (a.actionDate === null) return 1
      if (b.actionDate === null) return -1
      return a.actionDate.localeCompare(b.actionDate) * factor || byId(a, b)
    })
  }

  return [...tickets].sort((a, b) => comparePlain(a, b, by) * factor || byId(a, b))
}
