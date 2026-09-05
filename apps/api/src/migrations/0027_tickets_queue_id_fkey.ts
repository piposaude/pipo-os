import { sql, type Kysely } from 'kysely'

// tickets.queue_id was born loose in the 0003, while the same column in
// ticket_queues_x_group got a foreign key in the 0004. That asymmetry became
// behaviour: the only thing stopping DELETE /api/queues/:id from orphaning rows
// is the FK written for the link table, which the repository turns into a 409.
// A queue with no groups and with tickets deleted fine, and the tickets kept
// pointing at a row that was gone — the column GET /api/queues/:id/tickets reads.
//
// RESTRICT and not SET NULL: the link is information, and whoever deletes the
// queue should decide what happens to it. It is also what the route already
// does for groups, so it gains no second semantics.
export async function up(db: Kysely<unknown>): Promise<void> {
  // A value pointing at a queue that no longer exists cannot be honoured by the
  // constraint and says nothing — it is the damage this migration exists to
  // stop. Clearing it is the only way ADD CONSTRAINT cannot fail on old rows.
  await sql`
    UPDATE tickets
      SET queue_id = NULL
    WHERE queue_id IS NOT NULL
      AND queue_id NOT IN (SELECT id FROM ticket_queues)
  `.execute(db)

  await sql`
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_queue_id_fkey
      FOREIGN KEY (queue_id) REFERENCES ticket_queues (id) ON DELETE RESTRICT
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tickets DROP CONSTRAINT tickets_queue_id_fkey`.execute(db)
}
