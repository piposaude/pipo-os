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
  // both sides of the OR have to be indexed. Partial, unlike its sibling: the
  // column is null for every company that already is the parent, which is most
  // of them, and `IN (...)` never matches a null anyway.
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
