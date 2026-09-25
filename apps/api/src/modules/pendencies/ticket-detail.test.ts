import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

const note = [{ channel: 'internal', body: 'cobrado do RH' }]

describe('openPendencies in GET /api/tickets/:id', () => {
  let app: FastifyInstance
  let sessionCookie: string
  let rootGroupId: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
    })
    sessionCookie = login.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  const openTicket = async (): Promise<string> => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: {
        enrollmentId: randomUUID(),
        enrollmentType: 'inclusion',
        companyId: '00000000-0000-4000-8000-000000000402',
        sourceSystem: 'enrollment-integrations',
        enrollmentSnapshot: {},
      },
    })
    return created.json().id
  }

  const charge = async (id: string, pendencies: object) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${id}/submissions`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: { submissionId: randomUUID(), parts: note, pendencies },
    })
    expect(response.statusCode).toBe(201)
    return response.json().comments[0].createdAt as string
  }

  const detail = async (id: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/${id}`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })
    expect(response.statusCode).toBe(200)
    return response.json()
  }

  it('answers an empty list for a ticket nobody charged', async () => {
    const id = await openTicket()

    expect((await detail(id)).openPendencies).toEqual([])
  })

  it('keeps open what was charged and did not arrive', async () => {
    const id = await openTicket()
    const openedAt = await charge(id, { opened: ['rg', 'cpf'] })
    await charge(id, { resolved: ['cpf'] })

    expect((await detail(id)).openPendencies).toEqual([
      { itemId: 'rg', since: openedAt, chargedCount: 1 },
    ])
  })

  it('reopens an item that arrived as a new cycle, after three events', async () => {
    const id = await openTicket()
    await charge(id, { opened: ['rg'] })
    await charge(id, { resolved: ['rg'] })
    const reopenedAt = await charge(id, { opened: ['rg'] })

    expect((await detail(id)).openPendencies).toEqual([
      { itemId: 'rg', since: reopenedAt, chargedCount: 1 },
    ])
  })
})
