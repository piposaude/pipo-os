import { sql, type Kysely } from 'kysely'

// The 0003 dropped the constraint the 0001 had created and never put one back,
// so `status` has accepted any text since. It matters more than a typo would:
// `uq_tickets_open_enrollment` filters on `status NOT IN ('completed',
// 'cancelled')`, so a word outside the vocabulary falls out of the partial index
// and the enrollment quietly loses its protection against a duplicate ticket.
//
// A CHECK and not an enum: the set is still moving (DSP-19 may drop the reopen),
// and Postgres lets a CHECK change in a migration while it never lets an enum
// value be removed.
const STATUSES = [
  'broker-processing',
  'carrier-processing',
  'broker-open-issue',
  'missing-documents',
  'incorrect-data',
  'completed',
  'cancelled',
  'submitted-cancellation',
] as const

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_status_check
      CHECK (status IN (${sql.join(STATUSES.map((status) => sql.lit(status)))}))
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tickets DROP CONSTRAINT tickets_status_check`.execute(db)
}
