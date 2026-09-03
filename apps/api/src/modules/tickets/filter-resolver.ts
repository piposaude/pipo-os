import { sql, type Expression, type ExpressionBuilder, type SqlBool } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import { UnprocessableEntityError } from '../../shared/errors.js'
import type { TicketFilter } from './filter-schema.js'

/** Not columns yet. Refused instead of ignored: a dropped criterion widens the
 *  queue in silence, and the count would stop matching the list. */
export const SNAPSHOT_FIELDS = [
  'carrierIds',
  'products',
  'companySizes',
  'contractTypes',
  'relationships',
] as const

export class UnsupportedFilterField extends UnprocessableEntityError {
  constructor(readonly field: string) {
    super(`Filter field "${field}" is not resolvable server-side yet`)
    this.name = 'UnsupportedFilterField'
  }
}

/** Twin of SLEEP_DAYS in web/src/lib/pipodesk/filter.ts. */
export const SLEEP_DAYS = 2

type Eb = ExpressionBuilder<Database, 'tickets'>

/** `@me` is resolved here, never stored: the token means "the caller", so a
 *  shared queue shows each viewer their own tickets. */
const resolveAssignees = (values: (string | null)[], viewerId: string): (string | null)[] =>
  values.map((value) => (value === '@me' ? viewerId : value))

/** A list that may carry `null` becomes `col IN (...) OR col IS NULL`, because
 *  SQL `IN` never matches NULL. */
function inOrNull(eb: Eb, column: 'assignee_id' | 'priority', values: (string | null)[]) {
  const present = values.filter((value): value is string => value !== null)
  const parts: Expression<SqlBool>[] = []
  if (present.length > 0) parts.push(eb(column, 'in', present))
  if (values.length !== present.length) parts.push(eb(column, 'is', null))
  return eb.or(parts)
}

/** Fields are an AND, values inside a list are an OR. Two exceptions: `tags`
 *  asks for all of them, and `urgentBy` is itself an OR. */
export function ticketFilterConditions(
  eb: Eb,
  filter: TicketFilter,
  viewerId: string,
): Expression<SqlBool>[] {
  for (const field of SNAPSHOT_FIELDS) {
    if (filter[field] !== undefined) throw new UnsupportedFilterField(field)
  }

  const conditions: Expression<SqlBool>[] = []

  if (filter.statuses?.length) conditions.push(eb('status', 'in', filter.statuses))
  if (filter.companyIds?.length) conditions.push(eb('company_id', 'in', filter.companyIds))
  if (filter.types?.length) conditions.push(eb('enrollment_type', 'in', filter.types))
  if (filter.origins?.length) conditions.push(eb('source_system', 'in', filter.origins))
  if (filter.groupIds?.length) conditions.push(eb('group_id', 'in', filter.groupIds))

  // `@>` is contains, not `&&`: the contract asks for every tag listed, while
  // the older listTicketsQuery.tags is an overlap and stays an OR.
  if (filter.tags?.length) {
    conditions.push(sql<SqlBool>`tags @> ${filter.tags}::text[]`)
  }

  if (filter.assigneeIds?.length) {
    conditions.push(inOrNull(eb, 'assignee_id', resolveAssignees(filter.assigneeIds, viewerId)))
  }
  if (filter.priorities?.length) {
    conditions.push(inOrNull(eb, 'priority', filter.priorities))
  }

  // Both sides truncated: the column is timestamptz and the cut is date-only,
  // so without `::date` the time of day moves the boundary.
  if (filter.actionDateBefore !== undefined) {
    conditions.push(sql<SqlBool>`action_date::date < ${filter.actionDateBefore}::date`)
  }
  if (filter.createdSince !== undefined) {
    conditions.push(sql<SqlBool>`created_at::date >= ${filter.createdSince}::date`)
  }
  if (filter.urgentBy !== undefined) {
    conditions.push(
      sql<SqlBool>`(priority = 'urgent' OR action_date::date < ${filter.urgentBy}::date)`,
    )
  }

  if (filter.archived !== undefined) {
    conditions.push(eb('closed_at', filter.archived ? 'is not' : 'is', null))
  }

  return conditions
}

export type ActionDateWindow = 'awake' | 'sleeping' | 'all'

export function actionDateWindowCondition(
  window: ActionDateWindow,
  today: string,
): Expression<SqlBool> | null {
  if (window === 'all') return null
  const cut = sql`${today}::date + ${SLEEP_DAYS}::int`
  return window === 'sleeping'
    ? sql<SqlBool>`action_date IS NOT NULL AND action_date::date > ${cut}`
    : sql<SqlBool>`(action_date IS NULL OR action_date::date <= ${cut})`
}
