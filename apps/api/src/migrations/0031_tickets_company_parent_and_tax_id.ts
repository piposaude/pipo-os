import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // The parent is a company id, not a group: the hierarchy of 0024 is of
  // groups, and the pipo-os has no company table. `null` means the ticket's
  // company already is the parent — the queue reads the pair that way.
  await sql`
    ALTER TABLE tickets
      ADD COLUMN parent_company_id uuid,
      ADD COLUMN parent_company_name text,
      ADD COLUMN company_tax_id text
  `.execute(db)

  // Sibling of ix_tickets_company: the queue filter matches either column, so
  // both sides of the OR have to be indexed.
  await db.schema
    .createIndex('ix_tickets_parent_company')
    .on('tickets')
    .column('parent_company_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('ix_tickets_parent_company').execute()
  await sql`
    ALTER TABLE tickets
      DROP COLUMN parent_company_id,
      DROP COLUMN parent_company_name,
      DROP COLUMN company_tax_id
  `.execute(db)
}
