import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'

describe('updated_at', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('is advanced by a trigger on every table that has the column', async () => {
    const { rows } = await sql<{ table_name: string; has_trigger: boolean }>`
      SELECT c.table_name,
             EXISTS (
               SELECT 1
               FROM pg_trigger t
               JOIN pg_proc p ON p.oid = t.tgfoid
               WHERE t.tgrelid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass
                 AND p.proname = 'set_updated_at'
                 AND NOT t.tgisinternal
             ) AS has_trigger
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
      WHERE c.table_schema = current_schema()
        AND c.column_name = 'updated_at'
        AND tb.table_type = 'BASE TABLE'
      ORDER BY c.table_name
    `.execute(app.db)

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((row) => !row.has_trigger).map((row) => row.table_name)).toEqual([])
  })
})
