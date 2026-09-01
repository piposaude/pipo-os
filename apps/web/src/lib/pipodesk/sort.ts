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
 */
export const TRIAGE_RANK = new Map<DisplayStatus, number>(
  (
    [
      'broker-processing',
      'client-pending',
      'carrier-processing',
      'submitted-cancellation',
      'completed',
      'cancelled',
    ] satisfies DisplayStatus[]
  ).map((status, index) => [status, index] as const),
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
      return (TRIAGE_RANK.get(a.display) ?? 0) - (TRIAGE_RANK.get(b.display) ?? 0)
  }
}

export function sortTickets(tickets: TicketRow[], sort: TicketSort): TicketRow[] {
  const factor = sort.direction === 'desc' ? -1 : 1
  const byId = (a: TicketRow, b: TicketRow): number => a.id.localeCompare(b.id)
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
