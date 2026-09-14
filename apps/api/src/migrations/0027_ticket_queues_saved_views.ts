import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // `group_by` NULL is "this view imposes no grouping", which is not the same
  // as 'none', "this view imposes a flat list".
  await sql`
    ALTER TABLE ticket_queues
      ADD COLUMN owner_id text,
      ADD COLUMN group_id uuid REFERENCES ticket_groups(id) ON DELETE RESTRICT,
      ADD COLUMN sort_by text NOT NULL DEFAULT 'actionDate'
        CONSTRAINT ticket_queues_sort_by_check
        CHECK (sort_by IN ('actionDate', 'createdAt', 'updatedAt', 'company', 'status')),
      ADD COLUMN sort_direction text NOT NULL DEFAULT 'asc'
        CONSTRAINT ticket_queues_sort_direction_check
        CHECK (sort_direction IN ('asc', 'desc')),
      ADD COLUMN group_by text
        CONSTRAINT ticket_queues_group_by_check
        CHECK (group_by IN ('status', 'company', 'product', 'assignee', 'none'))
  `.execute(db)

  await sql`CREATE INDEX ix_ticket_queues_group ON ticket_queues (group_id)`.execute(db)

  await sql`
    CREATE TABLE ticket_queue_favorites (
      queue_id   uuid NOT NULL REFERENCES ticket_queues(id) ON DELETE CASCADE,
      user_id    text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, queue_id)
    )
  `.execute(db)

  // Covers the cascade: Postgres does not index the referencing side.
  await sql`
    CREATE INDEX ix_ticket_queue_favorites_queue ON ticket_queue_favorites (queue_id)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS ticket_queue_favorites`.execute(db)
  await sql`DROP INDEX IF EXISTS ix_ticket_queues_group`.execute(db)
  await sql`
    ALTER TABLE ticket_queues
      DROP COLUMN IF EXISTS group_by,
      DROP COLUMN IF EXISTS sort_direction,
      DROP COLUMN IF EXISTS sort_by,
      DROP COLUMN IF EXISTS group_id,
      DROP COLUMN IF EXISTS owner_id
  `.execute(db)
}
