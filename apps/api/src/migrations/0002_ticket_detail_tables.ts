import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('ticket_form_values')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('ticket_id', 'uuid', (col) => col.notNull().references('tickets.id'))
    .addColumn('field_key', 'text', (col) => col.notNull())
    .addColumn('field_value', 'jsonb', (col) => col.notNull())
    .addColumn('updated_by', 'uuid')
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('uq_ticket_form_values_field')
    .unique()
    .on('ticket_form_values')
    .columns(['ticket_id', 'field_key'])
    .execute()

  await db.schema
    .createIndex('ix_ticket_form_values_ticket')
    .on('ticket_form_values')
    .column('ticket_id')
    .execute()

  await db.schema
    .createTable('ticket_status_history')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('ticket_id', 'uuid', (col) => col.notNull().references('tickets.id'))
    .addColumn('from_status', 'text')
    .addColumn('to_status', 'text', (col) => col.notNull())
    .addColumn('reason', 'text')
    .addColumn('actor_type', 'text', (col) => col.notNull())
    .addColumn('actor_id', 'uuid')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('ix_status_history_ticket')
    .on('ticket_status_history')
    .columns(['ticket_id', 'created_at'])
    .execute()

  await db.schema
    .createTable('ticket_comments')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('ticket_id', 'uuid', (col) => col.notNull().references('tickets.id'))
    .addColumn('kind', 'text', (col) => col.notNull())
    .addColumn('channel', 'text', (col) => col.notNull().defaultTo('internal'))
    .addColumn('visibility', 'text', (col) => col.notNull())
    .addColumn('event_type', 'text')
    .addColumn('author_id', 'uuid')
    .addColumn('body', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('ix_comments_ticket')
    .on('ticket_comments')
    .columns(['ticket_id', 'created_at'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('ix_comments_ticket').execute()
  await db.schema.dropTable('ticket_comments').ifExists().execute()

  await db.schema.dropIndex('ix_status_history_ticket').execute()
  await db.schema.dropTable('ticket_status_history').ifExists().execute()

  await db.schema.dropIndex('ix_ticket_form_values_ticket').execute()
  await db.schema.dropIndex('uq_ticket_form_values_field').execute()
  await db.schema.dropTable('ticket_form_values').ifExists().execute()
}
