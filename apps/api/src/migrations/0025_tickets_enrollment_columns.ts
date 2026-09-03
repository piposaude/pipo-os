import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE tickets
      ADD COLUMN carrier_id text,
      ADD COLUMN carrier_name text,
      ADD COLUMN product text,
      ADD COLUMN contract_type text,
      ADD COLUMN company_size text,
      ADD COLUMN relationship text
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE tickets
      DROP COLUMN carrier_id,
      DROP COLUMN carrier_name,
      DROP COLUMN product,
      DROP COLUMN contract_type,
      DROP COLUMN company_size,
      DROP COLUMN relationship
  `.execute(db)
}
