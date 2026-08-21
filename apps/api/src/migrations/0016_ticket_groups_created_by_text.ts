import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_groups ALTER COLUMN created_by TYPE text`.execute(db)
  await sql`ALTER TABLE ticket_queues ALTER COLUMN created_by TYPE text`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_groups ALTER COLUMN created_by TYPE uuid USING created_by::uuid`.execute(
    db,
  )
  await sql`ALTER TABLE ticket_queues ALTER COLUMN created_by TYPE uuid USING created_by::uuid`.execute(
    db,
  )
}
