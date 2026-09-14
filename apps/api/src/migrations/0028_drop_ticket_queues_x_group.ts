import { sql, type Kysely } from 'kysely'

/** The N:N answered "which pods work this queue", from when a queue was the box
 *  a ticket sat in. A saved view selects tickets instead of holding them, so the
 *  link now says where the view lives in the tree and who may edit it — both
 *  singular, and both `ticket_queues.group_id` (migration 0027). */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS ticket_queues_x_group`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE ticket_queues_x_group (
      queue_id   uuid NOT NULL REFERENCES ticket_queues(id),
      group_id   uuid NOT NULL REFERENCES ticket_groups(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pk_ticket_queues_x_group PRIMARY KEY (queue_id, group_id)
    )
  `.execute(db)

  await sql`
    CREATE INDEX ix_queues_x_group_group ON ticket_queues_x_group (group_id)
  `.execute(db)
}
