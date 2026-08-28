import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_status_history ALTER COLUMN author_id TYPE text USING author_id::text`.execute(
    db,
  )
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_status_history ALTER COLUMN author_id TYPE uuid USING author_id::uuid`.execute(
    db,
  )
}
