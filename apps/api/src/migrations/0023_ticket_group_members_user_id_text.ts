import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_group_members ALTER COLUMN user_id TYPE text USING user_id::text`.execute(
    db,
  )
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_group_members ALTER COLUMN user_id TYPE uuid USING user_id::uuid`.execute(
    db,
  )
}
