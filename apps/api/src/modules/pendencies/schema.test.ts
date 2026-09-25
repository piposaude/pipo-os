import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { CHECK_VIOLATION, codeOf } from '../../shared/pg.test-helpers.js'

describe('pendency_items schema', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.db.deleteFrom('pendency_items').where('id', 'like', 'test-%').execute()
  })

  afterAll(async () => {
    await app.close()
  })

  const insert = (values: object) =>
    app.db
      .insertInto('pendency_items')
      .values({ id: 'test-item', label: 'Item', category: 'document', position: 1000, ...values })
      .execute()

  it('refuses a category outside the four the drawer groups by', async () => {
    expect(await codeOf(insert({ category: 'documento' }))).toBe(CHECK_VIOLATION)
  })

  it('refuses a movement type outside the canonical ones', async () => {
    expect(await codeOf(insert({ enrollment_type: 'alteration' }))).toBe(CHECK_VIOLATION)
  })
})
