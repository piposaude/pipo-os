import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_email_attachments ALTER COLUMN id SET DEFAULT gen_random_uuid()`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_email_attachments ALTER COLUMN id DROP DEFAULT`.execute(db)
}
