import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('outbound_webhook_deliveries').dropColumn('from_status').execute()
  await db.schema.alterTable('outbound_webhook_deliveries').dropColumn('to_status').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('outbound_webhook_deliveries')
    .addColumn('from_status', 'text')
    .execute()

  await db.schema
    .alterTable('outbound_webhook_deliveries')
    .addColumn('to_status', 'text', (col) => col.notNull())
    .execute()
}
