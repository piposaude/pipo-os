import { sql, type Kysely } from 'kysely'

/** `SET NULL`, not `RESTRICT`: the saved view selects tickets instead of holding
 *  them, so deleting one says nothing about the tickets it happened to match. */
export async function up(db: Kysely<unknown>): Promise<void> {
  // The column carried no FK since 0003, so a queue id that no longer resolves
  // may already be stored — the constraint would refuse to be created over it.
  await sql`
    UPDATE tickets SET queue_id = NULL
    WHERE queue_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ticket_queues q WHERE q.id = tickets.queue_id)
  `.execute(db)

  await sql`
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_queue_id_fkey
      FOREIGN KEY (queue_id) REFERENCES ticket_queues(id) ON DELETE SET NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_queue_id_fkey`.execute(db)
}
