import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE ticket_completion_members (
      ticket_id uuid NOT NULL REFERENCES tickets (id),
      tax_id text NOT NULL CONSTRAINT ticket_completion_members_tax_id_check
        CHECK (tax_id ~ '^[0-9]{11}$'),
      id_card_number text NOT NULL,
      start_date date NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (ticket_id, tax_id)
    )
  `.execute(db)

  await sql`
    CREATE TRIGGER trg_ticket_completion_members_updated_at
    BEFORE UPDATE ON ticket_completion_members
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db)

  await sql`
    ALTER TABLE tickets
      ADD COLUMN end_date date,
      ADD COLUMN effective_date date,
      ADD COLUMN mecsas_company_code text,
      ADD COLUMN has_grace_period boolean,
      ADD COLUMN carrier_tracking_number text,
      ADD COLUMN document_types text[]
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE tickets
      DROP COLUMN end_date,
      DROP COLUMN effective_date,
      DROP COLUMN mecsas_company_code,
      DROP COLUMN has_grace_period,
      DROP COLUMN carrier_tracking_number,
      DROP COLUMN document_types
  `.execute(db)
  await sql`DROP TABLE ticket_completion_members`.execute(db)
}
