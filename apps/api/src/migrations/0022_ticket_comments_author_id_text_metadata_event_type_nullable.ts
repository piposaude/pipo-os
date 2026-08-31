import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_comments ALTER COLUMN author_id TYPE text USING author_id::text`.execute(
    db,
  )
  await sql`ALTER TABLE ticket_comments ALTER COLUMN author_id DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE ticket_comments ALTER COLUMN event_type DROP NOT NULL`.execute(db)
  await sql`ALTER TABLE ticket_comments ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE ticket_comments DROP COLUMN metadata`.execute(db)
  await sql`ALTER TABLE ticket_comments ALTER COLUMN event_type SET NOT NULL`.execute(db)
  await sql`
    ALTER TABLE ticket_comments
    ALTER COLUMN author_id TYPE uuid
    USING CASE
      WHEN author_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN author_id::uuid
      ELSE NULL
    END
  `.execute(db)
}
