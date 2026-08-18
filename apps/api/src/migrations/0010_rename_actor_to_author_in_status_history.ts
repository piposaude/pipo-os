import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('ticket_status_history')
    .renameColumn('actor_type', 'author_type')
    .execute()

  await db.schema
    .alterTable('ticket_status_history')
    .renameColumn('actor_id', 'author_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('ticket_status_history')
    .renameColumn('author_type', 'actor_type')
    .execute()

  await db.schema
    .alterTable('ticket_status_history')
    .renameColumn('author_id', 'actor_id')
    .execute()
}
