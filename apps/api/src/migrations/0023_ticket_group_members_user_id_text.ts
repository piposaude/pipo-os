import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_group_members ALTER COLUMN user_id TYPE text USING user_id::text`.execute(
    db,
  )
}

/** Reverts while every user_id still casts, and fails loudly once one does
 *  not: user_id is part of the primary key, so an e-mail has no uuid to fall
 *  back to and nothing may be silently dropped. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_group_members ALTER COLUMN user_id TYPE uuid USING user_id::uuid`.execute(
    db,
  )
}
