import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_group_members ALTER COLUMN user_id TYPE text USING user_id::text`.execute(
    db,
  )
}

export async function down(): Promise<void> {
  throw new Error(
    'Migration 0023 is irreversible: user_id is part of the primary key, so an e-mail that cannot be cast back to uuid has no valid value to fall back to',
  )
}
