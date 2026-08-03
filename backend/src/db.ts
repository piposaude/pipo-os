import { Pool } from 'pg'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://pipo_os:pipo_os@localhost:5432/pipo_os',
})

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
}
