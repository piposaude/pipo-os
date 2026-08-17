import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE ticket_comments
    ADD CONSTRAINT uq_ticket_comments_id_ticket UNIQUE (id, ticket_id)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE ticket_comments
    DROP CONSTRAINT uq_ticket_comments_id_ticket
  `.execute(db)
}
