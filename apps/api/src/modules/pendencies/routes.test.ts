import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

interface ListedItem {
  id: string
  label: string
  category: string
  enrollmentType: string | null
}

describe('GET /api/pendency-items', () => {
  let app: FastifyInstance
  let sessionCookie: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
    })
    sessionCookie = login.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value
  })

  afterEach(async () => {
    await app.db.deleteFrom('pendency_items').where('id', 'like', 'test-%').execute()
  })

  afterAll(async () => {
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  const list = async (query = ''): Promise<ListedItem[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/pendency-items${query}`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })
    expect(response.statusCode).toBe(200)
    return response.json().data
  }

  const insertItem = (id: string, overrides: object = {}) =>
    app.db
      .insertInto('pendency_items')
      .values({ id, label: id, category: 'document', position: 1000, ...overrides })
      .execute()

  it('serves the provisional list the migration seeds', async () => {
    const items = await list()

    expect(items).toHaveLength(25)
    expect(items.find((item) => item.id === 'assin-ficha-inclusao-rh')).toEqual({
      id: 'assin-ficha-inclusao-rh',
      label: 'Ficha de inclusão — assinatura do RH',
      category: 'signature',
      enrollmentType: 'inclusion',
    })
  })

  it('orders by position, not by label', async () => {
    await insertItem('test-first', { label: 'Zzz', position: 1000 })
    await insertItem('test-second', { label: 'Aaa', position: 1001 })

    const ids = (await list()).map((item) => item.id)

    expect(ids.indexOf('test-first')).toBeLessThan(ids.indexOf('test-second'))
  })

  it('cuts the list to the movement type and the items of any type', async () => {
    const ids = (await list('?enrollmentType=exclusion')).map((item) => item.id)

    expect(ids).toContain('ficha-exclusao')
    expect(ids).toContain('rg')
    expect(ids).not.toContain('ficha-inclusao')
  })

  it('reads a type no item names as one that only gets the items of any type', async () => {
    const items = await list('?enrollmentType=alteration')

    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.enrollmentType === null)).toBe(true)
  })

  it('leaves an inactive item out', async () => {
    await insertItem('test-retired', { active: false })

    expect((await list()).map((item) => item.id)).not.toContain('test-retired')
  })
})
