import { promises as fs } from 'node:fs'
import path from 'node:path'
import { Kysely, PostgresDialect } from 'kysely'
import { FileMigrationProvider, Migrator, type MigrationResult } from 'kysely/migration'
import fp from 'fastify-plugin'
import { Pool } from 'pg'
import type { DB } from './db-types.js'

export type Database = DB

declare module 'fastify' {
  interface FastifyInstance {
    db: Kysely<Database>
  }
}

async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(import.meta.dirname, '..', 'migrations'),
    }),
  })

  const { error, results } = await migrator.migrateToLatest()

  const failed = results?.find((result: MigrationResult) => result.status === 'Error')
  if (failed) {
    throw new Error(`failed to execute migration "${failed.migrationName}"`)
  }
  if (error) {
    throw error
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

    // Kysely's Migrator serializes concurrent callers through the kysely_migration_lock
    // table, so multiple app instances (or parallel vitest workers) booting against the
    // same database migrate safely instead of racing.
    await migrateToLatest(db)

    app.decorate('db', db)
    app.addHook('onClose', async () => {
      await db.destroy()
    })
  },
  { name: 'db' },
)
