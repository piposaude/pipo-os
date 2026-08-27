import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_queues ADD COLUMN updated_by text`.execute(db)
  await sql`ALTER TABLE ticket_groups ADD COLUMN updated_by text`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_queues DROP COLUMN updated_by`.execute(db)
  await sql`ALTER TABLE ticket_groups DROP COLUMN updated_by`.execute(db)
}
