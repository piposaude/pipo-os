import { PostgresDialect } from 'kysely'
import { defineConfig } from 'kysely-ctl'
import { Pool } from 'pg'

export default defineConfig({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://pipo_os:pipo_os@localhost:5432/pipo_os',
    }),
  }),
  migrations: {
    migrationFolder: 'src/migrations',
  },
})
