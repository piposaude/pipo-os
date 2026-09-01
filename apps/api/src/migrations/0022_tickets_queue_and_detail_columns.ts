import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE SEQUENCE tickets_display_number_seq`.execute(db)

  await sql`
    CREATE FUNCTION next_ticket_display_number() RETURNS text
    LANGUAGE sql AS $$
      SELECT 'M' || lpad(n::text, greatest(6, length(n::text)), '0')
      FROM nextval('tickets_display_number_seq') AS n
    $$
  `.execute(db)

  await sql`
    ALTER TABLE tickets
      ADD COLUMN title text,
      ADD COLUMN display_number text NOT NULL DEFAULT next_ticket_display_number(),
      ADD COLUMN priority text CONSTRAINT tickets_priority_check
        CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
      ADD COLUMN action_date timestamptz,
      ADD COLUMN group_id uuid REFERENCES ticket_groups(id),
      ADD COLUMN pending_documentation text[] NOT NULL DEFAULT '{}'::text[],
      ADD COLUMN requester jsonb CONSTRAINT tickets_requester_is_object
        CHECK (requester IS NULL OR jsonb_typeof(requester) = 'object'),
      ADD COLUMN collaborators jsonb NOT NULL DEFAULT '[]'::jsonb
        CONSTRAINT tickets_collaborators_is_object_array
        CHECK (
          jsonb_typeof(collaborators) = 'array'
          AND NOT jsonb_path_exists(collaborators, '$[*] ? (@.type() != "object")')
        )
  `.execute(db)

  await sql`
    ALTER TABLE tickets
      ADD CONSTRAINT uq_tickets_display_number UNIQUE (display_number)
  `.execute(db)

  await sql`CREATE INDEX ix_tickets_group_status ON tickets (group_id, status)`.execute(db)
  await sql`
    CREATE INDEX ix_tickets_action_date ON tickets (action_date)
      WHERE action_date IS NOT NULL
  `.execute(db)
  await sql`
    CREATE INDEX ix_tickets_priority ON tickets (priority)
      WHERE priority IS NOT NULL
  `.execute(db)
  await sql`CREATE INDEX ix_tickets_created_at_desc ON tickets (created_at DESC, id DESC)`.execute(
    db,
  )
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX ix_tickets_created_at_desc`.execute(db)
  await sql`DROP INDEX ix_tickets_priority`.execute(db)
  await sql`DROP INDEX ix_tickets_action_date`.execute(db)
  await sql`DROP INDEX ix_tickets_group_status`.execute(db)

  await sql`
    ALTER TABLE tickets
      DROP COLUMN collaborators,
      DROP COLUMN requester,
      DROP COLUMN pending_documentation,
      DROP COLUMN group_id,
      DROP COLUMN action_date,
      DROP COLUMN priority,
      DROP COLUMN display_number,
      DROP COLUMN title
  `.execute(db)

  await sql`DROP FUNCTION next_ticket_display_number()`.execute(db)
  await sql`DROP SEQUENCE tickets_display_number_seq`.execute(db)
}
