import { sql, type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE tickets t
       SET group_id = coalesce(
             (SELECT c.group_id FROM ticket_group_companies c WHERE c.company_id = t.company_id),
             (SELECT g.id FROM ticket_groups g WHERE g.parent_id IS NULL ORDER BY g.created_at LIMIT 1)
           )
     WHERE t.group_id IS NULL
  `.execute(db)

  const { rows } = await sql<{ count: string }>`
    SELECT count(*) AS count FROM tickets WHERE group_id IS NULL
  `.execute(db)
  const left = Number(rows[0]?.count ?? 0)
  if (left > 0) {
    throw new Error(
      `${left} ticket(s) of companies in no portfolio and no root group to put them in: create the root group first`,
    )
  }

  await sql`ALTER TABLE tickets ALTER COLUMN group_id SET NOT NULL`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE tickets ALTER COLUMN group_id DROP NOT NULL`.execute(db)
}
