import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('tickets')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('enrollment_id', 'uuid', (col) => col.notNull())
    .addColumn('enrollment_type', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('queue_id', 'uuid')
    .addColumn('assignee_id', 'uuid')
    .addColumn('company_id', 'uuid', (col) => col.notNull())
    .addColumn('tags', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('force_completion', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('enrollment_snapshot', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('source_system', 'text', (col) => col.notNull())
    .addColumn('parent_ticket_id', 'uuid', (col) => col.references('tickets.id'))
    .addColumn('closed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`
    CREATE UNIQUE INDEX uq_tickets_open_enrollment
      ON tickets (enrollment_id)
      WHERE status NOT IN ('completed', 'cancelled')
  `.execute(db)

  await db.schema
    .createIndex('ix_tickets_queue_status')
    .on('tickets')
    .columns(['queue_id', 'status'])
    .execute()

  await db.schema.createIndex('ix_tickets_assignee').on('tickets').column('assignee_id').execute()

  await db.schema
    .createIndex('ix_tickets_tags')
    .on('tickets')
    .using('gin')
    .column('tags')
    .execute()

  await db.schema.createIndex('ix_tickets_company').on('tickets').column('company_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('ix_tickets_company').execute()
  await db.schema.dropIndex('ix_tickets_tags').execute()
  await db.schema.dropIndex('ix_tickets_assignee').execute()
  await db.schema.dropIndex('ix_tickets_queue_status').execute()
  await db.schema.dropIndex('uq_tickets_open_enrollment').execute()
  await db.schema.dropTable('tickets').ifExists().execute()
}
