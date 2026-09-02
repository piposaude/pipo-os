import { DISPLAY_STATUS_COPY } from '@/constants/pipodesk/status'
import { PRODUCT_COPY } from '@/constants/pipodesk/domain'
import { DISPLAY_STATUSES, type DisplayStatus } from './status'
import { NULL_TOKEN } from './filter'
import type { TicketRow } from './ticket-row'

/**
 * Queue grouping. Grouping never reorders: rows keep the incoming order and
 * groups appear in first-seen order — except status, which follows the
 * canonical six-state order (not the triage rank from sort.ts).
 */

export type GroupBy = 'status' | 'company' | 'product' | 'assignee' | 'none'

export interface TicketGroup {
  key: string
  label: string
  tickets: TicketRow[]
}

export type NameResolver = (assigneeId: string) => string

const CANONICAL_STATUS_RANK = new Map(
  DISPLAY_STATUSES.map((status, index) => [status as string, index] as const),
)

function keyAndLabelOf(
  ticket: TicketRow,
  groupBy: Exclude<GroupBy, 'none'>,
  resolveName?: NameResolver,
): { key: string; label: string } {
  switch (groupBy) {
    case 'status':
      return { key: ticket.display, label: DISPLAY_STATUS_COPY[ticket.display] }
    case 'company':
      return { key: ticket.companyId, label: ticket.companyName ?? ticket.companyId }
    case 'product':
      return ticket.product
        ? { key: ticket.product, label: PRODUCT_COPY[ticket.product] ?? ticket.product }
        : { key: NULL_TOKEN, label: 'Sem produto' }
    case 'assignee':
      return ticket.assigneeId === null
        ? { key: NULL_TOKEN, label: 'Livre no pod' }
        : {
            key: ticket.assigneeId,
            label: resolveName?.(ticket.assigneeId) ?? ticket.assigneeId,
          }
  }
}

export function groupTickets(
  tickets: TicketRow[],
  groupBy: GroupBy,
  resolveName?: NameResolver,
): TicketGroup[] {
  if (groupBy === 'none') return [{ key: 'todos', label: '', tickets }]

  const groups = new Map<string, TicketGroup>()
  for (const ticket of tickets) {
    const { key, label } = keyAndLabelOf(ticket, groupBy, resolveName)
    const existing = groups.get(key)
    if (existing) existing.tickets.push(ticket)
    else groups.set(key, { key, label, tickets: [ticket] })
  }

  const list = [...groups.values()]
  if (groupBy === 'status') {
    list.sort(
      (a, b) =>
        (CANONICAL_STATUS_RANK.get(a.key as DisplayStatus) ?? 0) -
        (CANONICAL_STATUS_RANK.get(b.key as DisplayStatus) ?? 0),
    )
  }
  return list
}
