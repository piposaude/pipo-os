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

async function ensureSchema(db: Kysely<Database>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS tickets (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db)
}

export default fp(
  async function dbPlugin(app) {
    const db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool({
          connectionString:
            process.env.DATABASE_URL ?? 'postgresql://pipo_os:pipo_os@localhost:5432/pipo_os',
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
