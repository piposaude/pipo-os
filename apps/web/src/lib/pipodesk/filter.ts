import type { TicketFilter as ApiTicketFilter } from '@pipo-os/api-client'
import type { TicketRow } from './ticket-row'

/**
 * Queue filtering, plus the alive/awake window rules.
 *
 * `statuses: [a, b]` matches a or b, and every extra field narrows further.
 * `tags` is the exception: it asks for all the tags listed, not any of them.
 * `urgentBy` matches a ticket that is urgent or already past its action date.
 *
 * `statuses` stores the 8 API values, not the 6 UI ones — "Com o cliente"
 * writes `['missing-documents', 'incorrect-data']`, so a saved filter resolves
 * to the same set here and in the server-side resolver.
 */

/** `null` is the unassigned ticket. `@me` is not a separate member of this
 *  type — it is a plain string that the server resolves to the viewer. */
export type AssigneeFilterValue = NonNullable<ApiTicketFilter['assigneeIds']>[number]

/**
 * `null` is a legitimate value in `assigneeIds` (unassigned), `priorities` (no
 * priority) and `contractTypes` (no contract in the snapshot — the MOV PJ cut
 * filters `['pj', null]` so the list matches the tally, which counts non-CLT).
 */
export interface TicketFilter extends ApiTicketFilter {
  /** Computed per render from a query result; never a saved filter. */
  ticketIds?: string[]
  taxIds?: string[]
}

export type FilterField =
  | 'statuses'
  | 'companyIds'
  | 'carrierIds'
  | 'products'
  | 'types'
  | 'portes'
  | 'contractTypes'
  | 'relationships'
  | 'origins'
  | 'groupIds'
  | 'tags'
  | 'assigneeIds'
  | 'priorities'

/** How many days ahead an action date may be before the ticket leaves
 *  today's queue. Two: it resurfaces with room to be worked. */
export const SLEEP_DAYS = 2

const addDays = (isoDate: string, days: number): string =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** Cut date of an N-day window counted from `today` — never from the clock,
 *  so the queue is reproducible in tests. */
export const sinceOf = (days: number, today: string): string => addDays(today, -days)

/** Sleeping = action date more than two days out. Lives here, not in each
 *  queue, so sleepers cannot flood "all tickets" again. */
export function isSleeping(ticket: TicketRow, today: string): boolean {
  return ticket.actionDate !== null && ticket.actionDate > addDays(today, SLEEP_DAYS)
}

/** Which time window a node sees. Three values, not a boolean: the future
 *  node inverts the window instead of crossing it. */
export type WindowMode = 'awake' | 'sleeping' | 'all'

export function windowOf(tickets: TicketRow[], mode: WindowMode, today: string): TicketRow[] {
  if (mode === 'all') return tickets
  const live = tickets.filter((ticket) => ticket.closedAt === null)
  return mode === 'sleeping'
    ? live.filter((ticket) => isSleeping(ticket, today))
    : live.filter((ticket) => !isSleeping(ticket, today))
}

const missesList = <T>(wanted: T[] | undefined, value: T | null): boolean =>
  !!wanted?.length && (value === null || !wanted.includes(value))

export function matchesFilter(ticket: TicketRow, filter: TicketFilter, viewerId: string): boolean {
  if (filter.archived === false && ticket.closedAt !== null) return false
  if (filter.archived === true && ticket.closedAt === null) return false

  // String comparison is enough: both ends are ISO, which sorts chronologically.
  if (filter.createdSince && ticket.createdAt < filter.createdSince) return false

  if (missesList(filter.statuses, ticket.status)) return false
  if (missesList(filter.companyIds, ticket.companyId)) return false
  if (missesList(filter.carrierIds, ticket.carrierId)) return false
  if (missesList(filter.products, ticket.product)) return false
  if (missesList(filter.types, ticket.enrollmentType)) return false
  if (missesList(filter.portes, ticket.porte)) return false
  if (filter.contractTypes?.length && !filter.contractTypes.includes(ticket.contractType))
    return false
  if (missesList(filter.relationships, ticket.relationship)) return false
  if (missesList(filter.origins, ticket.sourceSystem)) return false
  if (missesList(filter.groupIds, ticket.groupId)) return false
  // The two search fields carry a query RESULT, so an empty list matches
  // nothing — otherwise a miss would return the whole queue.
  if (filter.ticketIds !== undefined && !filter.ticketIds.includes(ticket.id)) return false
  if (
    filter.taxIds !== undefined &&
    (ticket.taxId === null || !filter.taxIds.includes(ticket.taxId))
  ) {
    return false
  }

  if (filter.tags?.length && !filter.tags.every((tag) => ticket.tags.includes(tag))) return false

  if (filter.assigneeIds?.length) {
    const wanted = filter.assigneeIds.map((id) => (id === '@me' ? viewerId : id))
    if (!wanted.includes(ticket.assigneeId)) return false
  }

  if (filter.priorities?.length && !filter.priorities.includes(ticket.priority)) return false

  if (filter.actionDateBefore !== undefined) {
    if (ticket.actionDate === null || ticket.actionDate >= filter.actionDateBefore) return false
  }

  if (filter.urgentBy !== undefined) {
    const overdue = ticket.actionDate !== null && ticket.actionDate < filter.urgentBy
    if (ticket.priority !== 'urgent' && !overdue) return false
  }

  return true
}

export function applyFilter(
  tickets: TicketRow[],
  filter: TicketFilter,
  viewerId: string,
): TicketRow[] {
  return tickets.filter((ticket) => matchesFilter(ticket, filter, viewerId))
}

/** True when the filter pins the queue to a single assignee — the owner
 *  column would repeat one face and can be hidden. */
export function pinsOneAssignee(filter: TicketFilter, viewerId: string): boolean {
  const ids = filter.assigneeIds
  if (!ids?.length) return false
  return new Set(ids.map((id) => (id === '@me' ? viewerId : id))).size === 1
}

/** `'livre'` and `'sem'` are the display sentinels for `null`. */
const optionKeysOf = (ticket: TicketRow, field: FilterField): string[] => {
  switch (field) {
    case 'statuses':
      return [ticket.status]
    case 'companyIds':
      return [ticket.companyId]
    case 'carrierIds':
      return ticket.carrierId ? [ticket.carrierId] : []
    case 'products':
      return ticket.product ? [ticket.product] : []
    case 'types':
      return [ticket.enrollmentType]
    case 'portes':
      return ticket.porte ? [ticket.porte] : []
    case 'contractTypes':
      return ticket.contractType ? [ticket.contractType] : []
    case 'relationships':
      return ticket.relationship ? [ticket.relationship] : []
    case 'origins':
      return [ticket.sourceSystem]
    case 'groupIds':
      return ticket.groupId ? [ticket.groupId] : []
    case 'tags':
      return ticket.tags
    case 'assigneeIds':
      return [ticket.assigneeId ?? 'livre']
    case 'priorities':
      return [ticket.priority ?? 'sem']
  }
}

/** Per-option counts for the filter panel, over the base already cut by the
 *  other chips — the number promised must be the number delivered. */
export function countByOption(tickets: TicketRow[], field: FilterField): Map<string, number> {
  const counts = new Map<string, number>()
  for (const ticket of tickets) {
    for (const key of optionKeysOf(ticket, field)) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}
