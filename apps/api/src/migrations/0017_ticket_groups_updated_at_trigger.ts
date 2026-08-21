import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TRIGGER trg_ticket_groups_updated_at
    BEFORE UPDATE ON ticket_groups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_ticket_groups_updated_at ON ticket_groups`.execute(db)
}
