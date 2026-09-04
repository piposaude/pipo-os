import { sql, type Expression, type ExpressionBuilder, type RawBuilder, type SqlBool } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { TicketFilter } from './filter-schema.js'
import { toStored, type VocabularyName } from './vocabulary.js'

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

/** The columns that hold the EI's word, each with the vocabulary that reads it. */
const VOCABULARY_OF = {
  product: 'product',
  company_size: 'companySize',
  contract_type: 'contractType',
} as const satisfies Record<string, VocabularyName>

/** Column holds the EI's word, filter arrives in the client's. A value with no
 *  stored form leaves `or([])`, which is `1 = 0`: it matches nothing, as on
 *  the web. */
function translatedIn(
  eb: Eb,
  column: keyof typeof VOCABULARY_OF,
  values: (string | null)[],
): Expression<SqlBool> {
  const present = values.filter((value): value is string => value !== null)
  const stored = present.flatMap((value) => toStored(VOCABULARY_OF[column], value))
  const parts: Expression<SqlBool>[] = []
  if (stored.length > 0) parts.push(eb(column, 'in', stored))
  if (values.length !== present.length) parts.push(eb(column, 'is', null))
  return eb.or(parts)
}

type Resolver = (eb: Eb, filter: TicketFilter, viewerId: string) => Expression<SqlBool> | null

/**
 * One resolver per field of the contract. The type makes a field added to the
 * schema and forgotten here a build error; and unlike a flag, an entry is the
 * condition itself, so a field cannot be marked handled without being resolved.
 *
 * Fields are an AND, values inside a list are an OR. Two exceptions: `tags`
 * asks for all of them, and `urgentBy` is itself an OR.
 */
export const FIELD_RESOLVERS: Record<keyof TicketFilter, Resolver> = {
  statuses: (eb, { statuses }) => (statuses?.length ? eb('status', 'in', statuses) : null),
  companyIds: (eb, { companyIds }) =>
    companyIds?.length ? eb('company_id', 'in', companyIds) : null,
  carrierIds: (eb, { carrierIds }) =>
    carrierIds?.length ? eb('carrier_id', 'in', carrierIds) : null,
  products: (eb, { products }) => (products?.length ? translatedIn(eb, 'product', products) : null),
  types: (eb, { types }) => (types?.length ? eb('enrollment_type', 'in', types) : null),
  companySizes: (eb, { companySizes }) =>
    companySizes?.length ? translatedIn(eb, 'company_size', companySizes) : null,
  contractTypes: (eb, { contractTypes }) =>
    contractTypes?.length ? translatedIn(eb, 'contract_type', contractTypes) : null,
  relationships: (eb, { relationships }) =>
    relationships?.length ? eb('relationship', 'in', relationships) : null,
  origins: (eb, { origins }) => (origins?.length ? eb('source_system', 'in', origins) : null),
  groupIds: (eb, { groupIds }) => (groupIds?.length ? eb('group_id', 'in', groupIds) : null),
  // `@>` is contains, not `&&`: the contract asks for every tag listed, while
  // the older listTicketsQuery.tags is an overlap and stays an OR.
  tags: (_eb, { tags }) => (tags?.length ? sql<SqlBool>`tags @> ${tags}::text[]` : null),
  assigneeIds: (eb, { assigneeIds }, viewerId) =>
    assigneeIds?.length
      ? inOrNull(eb, 'assignee_id', resolveAssignees(assigneeIds, viewerId))
      : null,
  priorities: (eb, { priorities }) =>
    priorities?.length ? inOrNull(eb, 'priority', priorities) : null,
  actionDateBefore: (_eb, { actionDateBefore }) =>
    actionDateBefore === undefined
      ? null
      : sql<SqlBool>`action_date < ${utcMidnight(actionDateBefore)}`,
  urgentBy: (_eb, { urgentBy }) =>
    urgentBy === undefined
      ? null
      : sql<SqlBool>`(priority = 'urgent' OR action_date < ${utcMidnight(urgentBy)})`,
  createdSince: (_eb, { createdSince }) =>
    createdSince === undefined ? null : sql<SqlBool>`created_at >= ${utcMidnight(createdSince)}`,
  archived: (eb, { archived }) =>
    archived === undefined ? null : eb('closed_at', archived ? 'is not' : 'is', null),
}

/** The saved filter as a list of conditions, one per field that is set. */
export function ticketFilterConditions(
  eb: Eb,
  filter: TicketFilter,
  viewerId: string,
): Expression<SqlBool>[] {
  return Object.values(FIELD_RESOLVERS)
    .map((resolve) => resolve(eb, filter, viewerId))
    .filter((condition): condition is Expression<SqlBool> => condition !== null)
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
