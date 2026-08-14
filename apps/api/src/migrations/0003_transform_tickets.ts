import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tickets DROP CONSTRAINT tickets_status_check`.execute(db)
  await sql`ALTER TABLE tickets ALTER COLUMN status DROP DEFAULT`.execute(db)

  await db.schema.alterTable('tickets').dropColumn('title').execute()
  await db.schema.alterTable('tickets').dropColumn('description').execute()

  await db.schema
    .alterTable('tickets')
    .addColumn('enrollment_id', 'uuid', (col) => col.notNull())
    .execute()
  await db.schema
    .alterTable('tickets')
    .addColumn('enrollment_type', 'text', (col) => col.notNull())
    .execute()
  await db.schema.alterTable('tickets').addColumn('queue_id', 'uuid').execute()
  await db.schema.alterTable('tickets').addColumn('assignee_id', 'uuid').execute()
  await db.schema
    .alterTable('tickets')
    .addColumn('company_id', 'uuid', (col) => col.notNull())
    .execute()
  await db.schema
    .alterTable('tickets')
    .addColumn('tags', sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'::text[]`))
    .execute()
  await db.schema
    .alterTable('tickets')
    .addColumn('force_completion', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute()
  await db.schema
    .alterTable('tickets')
    .addColumn('enrollment_snapshot', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`))
    .execute()
  await db.schema
    .alterTable('tickets')
    .addColumn('source_system', 'text', (col) => col.notNull())
    .execute()
  await db.schema
    .alterTable('tickets')
    .addColumn('parent_ticket_id', 'uuid', (col) => col.references('tickets.id'))
    .execute()
  await db.schema.alterTable('tickets').addColumn('closed_at', 'timestamptz').execute()
  await db.schema
    .alterTable('tickets')
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
  await db.schema.createIndex('ix_tickets_tags').on('tickets').using('gin').column('tags').execute()
  await db.schema.createIndex('ix_tickets_company').on('tickets').column('company_id').execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('ix_tickets_company').execute()
  await db.schema.dropIndex('ix_tickets_tags').execute()
  await db.schema.dropIndex('ix_tickets_assignee').execute()
  await db.schema.dropIndex('ix_tickets_queue_status').execute()
  await db.schema.dropIndex('uq_tickets_open_enrollment').execute()

  await db.schema.alterTable('tickets').dropColumn('updated_at').execute()
  await db.schema.alterTable('tickets').dropColumn('closed_at').execute()
  await db.schema.alterTable('tickets').dropColumn('parent_ticket_id').execute()
  await db.schema.alterTable('tickets').dropColumn('source_system').execute()
  await db.schema.alterTable('tickets').dropColumn('enrollment_snapshot').execute()
  await db.schema.alterTable('tickets').dropColumn('force_completion').execute()
  await db.schema.alterTable('tickets').dropColumn('tags').execute()
  await db.schema.alterTable('tickets').dropColumn('company_id').execute()
  await db.schema.alterTable('tickets').dropColumn('assignee_id').execute()
  await db.schema.alterTable('tickets').dropColumn('queue_id').execute()
  await db.schema.alterTable('tickets').dropColumn('enrollment_type').execute()
  await db.schema.alterTable('tickets').dropColumn('enrollment_id').execute()

  await db.schema
    .alterTable('tickets')
    .addColumn('title', 'text', (col) => col.notNull())
    .execute()
  await db.schema
    .alterTable('tickets')
    .addColumn('description', 'text', (col) => col.notNull())
    .execute()

  await sql`ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'open'`.execute(db)
  await sql`
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_status_check
      CHECK (status IN ('open', 'in_progress', 'closed'))
  `.execute(db)
}
