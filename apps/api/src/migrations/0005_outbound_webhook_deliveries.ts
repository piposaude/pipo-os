import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('outbound_webhook_deliveries')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('ticket_id', 'uuid', (col) => col.notNull().references('tickets.id'))
    .addColumn('from_status', 'text')
    .addColumn('to_status', 'text', (col) => col.notNull())
    .addColumn('target_url', 'text', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('attempt_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('last_error', 'text')
    .addColumn('delivered_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('ix_outbound_deliveries_ticket')
    .on('outbound_webhook_deliveries')
    .columns(['ticket_id', 'created_at'])
    .execute()

  await db.schema
    .createIndex('ix_outbound_deliveries_status')
    .on('outbound_webhook_deliveries')
    .column('status')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('ix_outbound_deliveries_status').execute()
  await db.schema.dropIndex('ix_outbound_deliveries_ticket').execute()
  await db.schema.dropTable('outbound_webhook_deliveries').ifExists().execute()
}
