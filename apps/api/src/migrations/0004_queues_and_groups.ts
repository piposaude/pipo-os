import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('ticket_queues')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('filters', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex('ix_queues_filters')
    .on('ticket_queues')
    .using('gin')
    .column('filters')
    .execute()

  await db.schema
    .createTable('ticket_groups')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createTable('ticket_group_members')
    .ifNotExists()
    .addColumn('group_id', 'uuid', (col) => col.notNull().references('ticket_groups.id'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('pk_ticket_group_members', ['group_id', 'user_id'])
    .execute()

  await db.schema
    .createIndex('ix_group_members_user')
    .on('ticket_group_members')
    .column('user_id')
    .execute()

  await db.schema
    .createTable('ticket_queues_x_group')
    .ifNotExists()
    .addColumn('queue_id', 'uuid', (col) => col.notNull().references('ticket_queues.id'))
    .addColumn('group_id', 'uuid', (col) => col.notNull().references('ticket_groups.id'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('pk_ticket_queues_x_group', ['queue_id', 'group_id'])
    .execute()

  await db.schema
    .createIndex('ix_queues_x_group_group')
    .on('ticket_queues_x_group')
    .column('group_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('ix_queues_x_group_group').execute()
  await db.schema.dropTable('ticket_queues_x_group').ifExists().execute()

  await db.schema.dropIndex('ix_group_members_user').execute()
  await db.schema.dropTable('ticket_group_members').ifExists().execute()

  await db.schema.dropTable('ticket_groups').ifExists().execute()

  await db.schema.dropIndex('ix_queues_filters').execute()
  await db.schema.dropTable('ticket_queues').ifExists().execute()
}
