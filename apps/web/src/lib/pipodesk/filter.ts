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

export type FilterField = {
  [K in keyof ApiTicketFilter]-?: NonNullable<ApiTicketFilter[K]> extends readonly unknown[]
    ? K
    : never
}[keyof ApiTicketFilter]

export function assertNever(value: never): never {
  throw new Error(`Unhandled filter field: ${String(value)}`)
}

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

/**
 * The token that stands for `null` in the panel and in the URL — `null` is a
 * real value in three fields (no owner, no priority, no contract). Reserved
 * and `@`-prefixed, in the same family as `'@me'`: a plain word like `sem`
 * lived in the same space as the data, so a contract type actually called
 * `sem` decoded as "no contract". The per-field WORDING lives in the copy
 * table, not here.
 */
export const NULL_TOKEN = '@none'

/** The only fields where `null` is a real value. Everywhere else the token is
 *  just data — `tags` carries free API strings, and a tag named `@none` must
 *  not decode as "no value". */
const NULLABLE_FIELDS: ReadonlySet<FilterField> = new Set([
  'assigneeIds',
  'priorities',
  'contractTypes',
])

/** Stored value → the token the panel and the URL carry. Encoding needs no
 *  field: only the fields above ever hold `null`. */
export const displayOf = (value: string | null): string => value ?? NULL_TOKEN

/** …and back, which DOES need the field: decoding the token is only correct
 *  where `null` is a legitimate value. */
export const storedOf = (field: FilterField, token: string): string | null =>
  token === NULL_TOKEN && NULLABLE_FIELDS.has(field) ? null : token

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
  if (missesList(filter.companySizes, ticket.companySize)) return false
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

/** Keys a ticket contributes to the option counts. A `null` with a sentinel
 *  becomes an option of its own; without one the ticket does not participate. */
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
    case 'companySizes':
      return ticket.companySize ? [ticket.companySize] : []
    case 'contractTypes':
      return [displayOf(ticket.contractType)]
    case 'relationships':
      return ticket.relationship ? [ticket.relationship] : []
    case 'origins':
      return [ticket.sourceSystem]
    case 'groupIds':
      return ticket.groupId ? [ticket.groupId] : []
    case 'tags':
      return ticket.tags
    case 'assigneeIds':
      return [displayOf(ticket.assigneeId)]
    case 'priorities':
      return [displayOf(ticket.priority)]
    default:
      return assertNever(field)
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
