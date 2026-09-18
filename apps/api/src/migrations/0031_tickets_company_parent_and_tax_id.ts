import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // A company id, not a group: the hierarchy of 0024 is of groups, and the
  // pipo-os has no company table to point an FK at.
  await sql`
    ALTER TABLE tickets
      ADD COLUMN parent_company_id uuid,
      ADD COLUMN parent_company_name text,
      ADD COLUMN company_tax_id text
  `.execute(db)

  // Sibling of ix_tickets_company: the queue filter ORs the two columns, so
  // both sides need an index. Partial because the column is null for every
  // company that already is the parent, and `IN (...)` never matches a null.
  await sql`
    CREATE INDEX ix_tickets_parent_company ON tickets (parent_company_id)
    WHERE parent_company_id IS NOT NULL
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX ix_tickets_parent_company`.execute(db)
  await sql`
    ALTER TABLE tickets
      DROP COLUMN parent_company_id,
      DROP COLUMN parent_company_name,
      DROP COLUMN company_tax_id
  `.execute(db)
}
