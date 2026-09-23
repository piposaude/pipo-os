import type { Kysely } from 'kysely'
import type { Database } from '../../infrastructure/db.js'

/** A ticket with no portfolio lands in the root group, so any suite that
 *  creates one needs a root. The suite deletes it, by id, after its tickets. */
export async function createRootGroup(db: Kysely<Database>): Promise<string> {
  const row = await db
    .insertInto('ticket_groups')
    .values({ name: 'Raiz', created_by: 'test' })
    .returning('id')
    .executeTakeFirstOrThrow()
  return row.id
}
