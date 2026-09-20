import { sql, type RawBuilder } from 'kysely'
import type { QueueSort, SortField } from '../queues/view-vocabulary.js'
import { snapshotString } from './enrollment-snapshot.js'

/** Twin of TRIAGE_ORDER in web/src/lib/pipodesk/sort.ts: the eight stored
 *  statuses fold into the six the screen ranks. Change one, change both. */
const TRIAGE_RANK: Record<string, number> = {
  'broker-processing': 0,
  'broker-open-issue': 0,
  'missing-documents': 1,
  'incorrect-data': 1,
  'carrier-processing': 2,
  'submitted-cancellation': 3,
  completed: 4,
  cancelled: 5,
}

const triageRank = (): RawBuilder<number> =>
  sql<number>`case status ${sql.join(
    Object.entries(TRIAGE_RANK).map(([status, rank]) => sql`when ${status} then ${sql.lit(rank)}`),
    sql` `,
  )} end`

const COLUMN_OF: Record<SortField, () => RawBuilder<unknown>> = {
  actionDate: () => sql`action_date`,
  createdAt: () => sql`created_at`,
  updatedAt: () => sql`updated_at`,
  company: () => snapshotString(['company'], ['company-name', 'name']),
  status: triageRank,
}

/** Nulls sink whichever the direction, as compareTickets does on the web; `id`
 *  closes the order so a page boundary is stable. */
export function queueOrderBy(sort: QueueSort): RawBuilder<unknown> {
  const direction = sort.direction === 'desc' ? sql`desc` : sql`asc`
  return sql`${COLUMN_OF[sort.by]()} ${direction} nulls last, updated_at asc, id asc`
}
