import { sql, type Expression, type ExpressionBuilder, type RawBuilder, type SqlBool } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { TicketFilter } from './filter-schema.js'
import { toStored } from './vocabulary.js'

/** A field added to the schema and forgotten here breaks the build, instead of
 *  being dropped from the query in silence. */
export const HANDLED_FIELDS: Record<keyof TicketFilter, true> = {
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
  actionDateBefore: true,
  urgentBy: true,
  createdSince: true,
  archived: true,
}

/** Twin of SLEEP_DAYS in web/src/lib/pipodesk/filter.ts. The two boundary
 *  tickets in contract/ticket-filter-cases.json fail whichever side moves alone. */
export const SLEEP_DAYS = 2

type Eb = ExpressionBuilder<Database, 'tickets'>

/** Midnight UTC of a calendar day, as an instant. The web reads the day off
 *  the ISO string, so the cut must not depend on the session TimeZone; and a
 *  bare column beside a constant is what lets the date indexes be used. */
const utcMidnight = (isoDate: string): RawBuilder<unknown> =>
  sql`${`${isoDate}T00:00:00Z`}::timestamptz`

const plusDays = (isoDate: string, days: number): string =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

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

/** Column holds the EI's word, filter arrives in the client's. */
function translatedIn(
  eb: Eb,
  column: 'company_size' | 'contract_type' | 'product',
  name: 'companySize' | 'contractType' | 'product',
  values: (string | null)[],
): Expression<SqlBool> {
  const present = values.filter((value): value is string => value !== null)
  const stored = present.flatMap((value) => toStored(name, value))
  const parts: Expression<SqlBool>[] = []
  if (stored.length > 0) parts.push(eb(column, 'in', stored))
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
  const conditions: Expression<SqlBool>[] = []

  if (filter.statuses?.length) conditions.push(eb('status', 'in', filter.statuses))
  if (filter.companyIds?.length) conditions.push(eb('company_id', 'in', filter.companyIds))
  if (filter.types?.length) conditions.push(eb('enrollment_type', 'in', filter.types))
  if (filter.origins?.length) conditions.push(eb('source_system', 'in', filter.origins))
  if (filter.groupIds?.length) conditions.push(eb('group_id', 'in', filter.groupIds))
  if (filter.carrierIds?.length) conditions.push(eb('carrier_id', 'in', filter.carrierIds))
  if (filter.relationships?.length) conditions.push(eb('relationship', 'in', filter.relationships))
  if (filter.products?.length) {
    conditions.push(translatedIn(eb, 'product', 'product', filter.products))
  }
  if (filter.companySizes?.length) {
    conditions.push(translatedIn(eb, 'company_size', 'companySize', filter.companySizes))
  }
  if (filter.contractTypes?.length) {
    conditions.push(translatedIn(eb, 'contract_type', 'contractType', filter.contractTypes))
  }

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

  if (filter.actionDateBefore !== undefined) {
    conditions.push(sql<SqlBool>`action_date < ${utcMidnight(filter.actionDateBefore)}`)
  }
  if (filter.createdSince !== undefined) {
    conditions.push(sql<SqlBool>`created_at >= ${utcMidnight(filter.createdSince)}`)
  }
  if (filter.urgentBy !== undefined) {
    conditions.push(
      sql<SqlBool>`(priority = 'urgent' OR action_date < ${utcMidnight(filter.urgentBy)})`,
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
  // Sleeping starts the day after the last awake one, so the cut is that
  // day's midnight: `>=` sleeps, `<` is awake.
  const cut = utcMidnight(plusDays(today, SLEEP_DAYS + 1))
  // A closed ticket is in neither window, as in windowOf on the web — `all` is
  // the only mode that crosses to it.
  return window === 'sleeping'
    ? sql<SqlBool>`closed_at IS NULL AND action_date >= ${cut}`
    : sql<SqlBool>`closed_at IS NULL AND (action_date IS NULL OR action_date < ${cut})`
}
