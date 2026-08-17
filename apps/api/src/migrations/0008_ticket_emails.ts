import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('ticket_emails')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('ticket_id', 'uuid', (col) => col.notNull().references('tickets.id'))
    .addColumn('comment_id', 'uuid', (col) => col.notNull())
    .addColumn('direction', 'text', (col) => col.notNull())
    .addColumn('gmail_message_id', 'text', (col) => col.notNull())
    .addColumn('gmail_thread_id', 'text', (col) => col.notNull())
    .addColumn('from_address', 'text', (col) => col.notNull())
    .addColumn('to_addresses', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'`))
    .addColumn('cc_addresses', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'`))
    .addColumn('subject', 'text')
    .addColumn('body_html', 'text')
    .addColumn('body_text', 'text')
    .addColumn('snippet', 'text')
    .addColumn('has_attachments', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint(
      'fk_ticket_emails_comment_ticket',
      ['comment_id', 'ticket_id'],
      'ticket_comments',
      ['id', 'ticket_id'],
    )
    .execute()

  await db.schema
    .createIndex('uq_ticket_emails_gmail_msg')
    .unique()
    .on('ticket_emails')
    .column('gmail_message_id')
    .execute()

  await db.schema
    .createIndex('uq_ticket_emails_comment')
    .unique()
    .on('ticket_emails')
    .column('comment_id')
    .execute()

  await db.schema
    .createIndex('ix_ticket_emails_ticket')
    .on('ticket_emails')
    .columns(['ticket_id', 'created_at'])
    .execute()

  await db.schema
    .createIndex('ix_ticket_emails_thread')
    .on('ticket_emails')
    .column('gmail_thread_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('ix_ticket_emails_thread').execute()
  await db.schema.dropIndex('ix_ticket_emails_ticket').execute()
  await db.schema.dropIndex('uq_ticket_emails_comment').execute()
  await db.schema.dropIndex('uq_ticket_emails_gmail_msg').execute()
  await db.schema.dropTable('ticket_emails').ifExists().execute()
}
