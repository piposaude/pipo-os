import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_comments ALTER COLUMN event_type SET NOT NULL`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_comments ALTER COLUMN event_type DROP NOT NULL`.execute(db)
}
