import { Kysely, PostgresDialect, sql, type ColumnType, type Generated } from 'kysely'
import fp from 'fastify-plugin'
import { Pool } from 'pg'

export interface TicketsTable {
  id: Generated<string>
  title: string
  description: string
  status: string
  created_at: ColumnType<Date, never, never>
}

export interface Database {
  tickets: TicketsTable
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Kysely<Database>
  }
}

function isConcurrentCreateTableRace(error: unknown): boolean {
  // CREATE TABLE IF NOT EXISTS has a documented Postgres race: two sessions can both
  // pass the existence check and then both attempt the insert into the system catalog,
  // so one loses with a 23505 on pg_type instead of a clean no-op. Happens whenever two
  // processes boot concurrently against a fresh schema (parallel test files here; also
  // possible with multiple replicas cold-starting in prod before ACE-12 migrations land).
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'pg_type_typname_nsp_index'
  )
}

async function ensureSchema(db: Kysely<Database>): Promise<void> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS tickets (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title       TEXT NOT NULL,
        description TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db)
  } catch (error) {
    if (!isConcurrentCreateTableRace(error)) {
      throw error
    }
  }
}

export default fp(
  async function dbPlugin(app) {
    const db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString:
            process.env.DATABASE_URL ?? 'postgresql://pipo_os:pipo_os@localhost:5432/pipo_os',
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          statement_timeout: 10_000,
        }),
      }),
    })

    await ensureSchema(db)

    app.decorate('db', db)
    app.addHook('onClose', async () => {
      await db.destroy()
    })
  },
  { name: 'db' },
)
