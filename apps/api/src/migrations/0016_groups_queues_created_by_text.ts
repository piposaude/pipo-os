import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_groups ALTER COLUMN created_by TYPE text USING created_by::text`.execute(
    db,
  )
  await sql`ALTER TABLE ticket_queues ALTER COLUMN created_by TYPE text USING created_by::text`.execute(
    db,
  )
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  throw new Error(
    'Migration 0016 is irreversible: created_by may already contain non-UUID email values that cannot be cast back to uuid',
  )
}
