import { sql, type Kysely } from 'kysely'

// One list for the two tables: split in two, a value added to only one of them
// would make the same authorType legal on one half of the timeline and not the
// other.
const AUTHOR_TYPES = sql`('user', 'service', 'system')`

export async function up(db: Kysely<unknown>): Promise<void> {
  // The default only backfills the rows that already exist (all manual, all by
  // people); it is dropped right after so every writer has to state the type.
  await sql`
    ALTER TABLE ticket_comments
      ADD COLUMN author_type text NOT NULL DEFAULT 'user',
      ADD CONSTRAINT ticket_comments_author_type_check CHECK (author_type IN ${AUTHOR_TYPES}),
      ADD COLUMN idempotency_key text,
      ADD COLUMN submission_id uuid,
      -- in_reply_to holds the submission_id of the thread root, not a row id:
      -- no FK on purpose.
      ADD COLUMN in_reply_to uuid
  `.execute(db)
  await sql`ALTER TABLE ticket_comments ALTER COLUMN author_type DROP DEFAULT`.execute(db)

  await sql`
    CREATE UNIQUE INDEX uq_ticket_comments_idempotency
      ON ticket_comments (ticket_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
  `.execute(db)

  await sql`
    ALTER TABLE ticket_status_history
      ADD COLUMN submission_id uuid,
      ADD CONSTRAINT ticket_status_history_author_type_check CHECK (author_type IN ${AUTHOR_TYPES})
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE ticket_status_history
      DROP CONSTRAINT IF EXISTS ticket_status_history_author_type_check,
      DROP COLUMN submission_id
  `.execute(db)
  await sql`DROP INDEX IF EXISTS uq_ticket_comments_idempotency`.execute(db)
  await sql`
    ALTER TABLE ticket_comments
      DROP CONSTRAINT IF EXISTS ticket_comments_author_type_check,
      DROP COLUMN in_reply_to,
      DROP COLUMN submission_id,
      DROP COLUMN idempotency_key,
      DROP COLUMN author_type
  `.execute(db)
}
