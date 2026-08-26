import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tickets ALTER COLUMN assignee_id TYPE text USING assignee_id::text`.execute(
    db,
  )
}

export async function down(): Promise<void> {
  throw new Error(
    'Migration 0019 is irreversible: assignee_id may already contain non-UUID email values that cannot be cast back to uuid',
  )
}
