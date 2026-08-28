import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_status_history ALTER COLUMN author_id TYPE text USING author_id::text`.execute(
    db,
  )
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE ticket_status_history
    ALTER COLUMN author_id TYPE uuid
    USING CASE
      WHEN author_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN author_id::uuid
      ELSE NULL
    END
  `.execute(db)
}
