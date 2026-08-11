import { Kysely, PostgresDialect } from 'kysely'
import fp from 'fastify-plugin'
import { Pool } from 'pg'
import type { DB } from './db-types.js'

export type Database = DB

declare module 'fastify' {
  interface FastifyInstance {
    db: Kysely<Database>
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

    app.decorate('db', db)
    app.addHook('onClose', async () => {
      await db.destroy()
    })
  },
  { name: 'db' },
)
