import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_comments ALTER COLUMN body SET NOT NULL`.execute(db)
  await sql`ALTER TABLE ticket_comments ALTER COLUMN author_id SET NOT NULL`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_comments ALTER COLUMN body DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE ticket_comments ALTER COLUMN author_id DROP NOT NULL`.execute(db)
}
