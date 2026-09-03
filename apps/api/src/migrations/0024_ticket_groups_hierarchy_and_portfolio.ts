import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE ticket_groups
      ADD COLUMN parent_id uuid REFERENCES ticket_groups(id) ON DELETE RESTRICT,
      ADD CONSTRAINT ticket_groups_parent_not_self
        CHECK (parent_id IS NULL OR parent_id <> id)
  `.execute(db)

  await sql`CREATE INDEX ix_ticket_groups_parent ON ticket_groups (parent_id)`.execute(db)

  await sql`
    ALTER TABLE ticket_group_members
      ADD COLUMN role text NOT NULL DEFAULT 'member'
        CONSTRAINT ticket_group_members_role_check CHECK (role IN ('admin', 'member'))
  `.execute(db)

  // The PK on company_id alone is the rule "a company belongs to one pod".
  // The UNIQUE is the target of the composite FK below — a foreign key can
  // only reference a primary key or a unique constraint.
  await sql`
    CREATE TABLE ticket_group_companies (
      company_id uuid PRIMARY KEY,
      group_id   uuid NOT NULL REFERENCES ticket_groups(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ticket_group_companies_group_company_key UNIQUE (group_id, company_id)
    )
  `.execute(db)

  /* Written where whoever asks "why is there no foreign key here?" will look:
     `\d+` in psql. A comment in the repository does not reach the person
     reading the database. */
  await sql`
    COMMENT ON COLUMN ticket_group_companies.company_id IS
      'No foreign key, and none is possible: companies live in another service, so there is no table to reference. Being a uuid is all the database guarantees — never that it names a company. Validation belongs to the edge that writes it (PD-051).'
  `.execute(db)

  await sql`
    CREATE TABLE ticket_group_member_companies (
      group_id   uuid NOT NULL,
      user_id    text NOT NULL,
      company_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, user_id, company_id),
      CONSTRAINT ticket_group_member_companies_member_fkey
        FOREIGN KEY (group_id, user_id)
        REFERENCES ticket_group_members (group_id, user_id) ON DELETE CASCADE,
      -- No ON UPDATE on purpose: adding it would make the cascade violate
      -- member_fkey, since the person is not a member of the destination pod.
      CONSTRAINT ticket_group_member_companies_company_fkey
        FOREIGN KEY (group_id, company_id)
        REFERENCES ticket_group_companies (group_id, company_id) ON DELETE CASCADE
    )
  `.execute(db)

  await sql`
    CREATE INDEX ix_ticket_group_member_companies_company
      ON ticket_group_member_companies (group_id, company_id)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS ticket_group_member_companies`.execute(db)
  await sql`DROP TABLE IF EXISTS ticket_group_companies`.execute(db)

  await sql`
    ALTER TABLE ticket_group_members
      DROP CONSTRAINT IF EXISTS ticket_group_members_role_check,
      DROP COLUMN IF EXISTS role
  `.execute(db)

  await sql`DROP INDEX IF EXISTS ix_ticket_groups_parent`.execute(db)

  await sql`
    ALTER TABLE ticket_groups
      DROP CONSTRAINT IF EXISTS ticket_groups_parent_not_self,
      DROP COLUMN IF EXISTS parent_id
  `.execute(db)
}
