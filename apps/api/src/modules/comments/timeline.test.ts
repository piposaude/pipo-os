import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

function cookieValue(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string | null {
  return response.cookies.find((cookie) => cookie.name === name)?.value ?? null
}

const DEV_LOGIN_USER_ID = 'dev@piposaude.com.br'
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000099'

const validTicketBody = {
  enrollmentId: '00000000-0000-4000-8000-000000000001',
  enrollmentType: 'inclusion',
  companyId: '00000000-0000-4000-8000-000000000002',
  sourceSystem: 'enrollment-integrations',
  enrollmentSnapshot: { name: 'Test User' },
}

describe('GET /api/tickets/:id/timeline', () => {
  let app: FastifyInstance
  let sessionCookie: string
  let ticketId: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/ticket/*'] },
    })
    sessionCookie = cookieValue(loginResponse, SESSION_COOKIE_NAME)!
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('tickets').execute()
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  /* A ticket per test: the status history is keyed by ticket, and a leftover
     row from a previous case would land in the middle of the chronology. */
  beforeEach(async () => {
    const ticketResponse = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      payload: validTicketBody,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })
    ticketId = ticketResponse.json().id
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  const addComment = (body: string, visibility: 'public' | 'private' = 'public') =>
    app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: { visibility, body },
    })

  const changeStatus = (status: string, reason?: string) =>
    app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: reason ? { status, reason } : { status },
    })

  const getTimeline = (query = '') =>
    app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/timeline${query}`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })

  it('merges comments and status changes into one chronology', async () => {
    await addComment('primeiro')
    await changeStatus('carrier-processing', 'enviado para a operadora')
    await addComment('terceiro')

    const response = await getTimeline()

    expect(response.statusCode).toBe(200)
    const { data } = response.json()
    expect(data.map((item: { type: string }) => item.type)).toEqual([
      'comment',
      'status-changed',
      'comment',
    ])
  })

  it('carries every field of a comment item', async () => {
    await addComment('o corpo do comentário')

    const [item] = (await getTimeline()).json().data

    expect(item).toMatchObject({
      type: 'comment',
      ticketId,
      body: 'o corpo do comentário',
      visibility: 'public',
      channel: 'internal',
      authorId: DEV_LOGIN_USER_ID,
    })
    expect(item.id).toEqual(expect.any(String))
    expect(item.createdAt).toEqual(expect.any(String))
  })

  it('carries every field of a status-changed item', async () => {
    await changeStatus('carrier-processing', 'enviado para a operadora')

    const [item] = (await getTimeline()).json().data

    expect(item).toMatchObject({
      type: 'status-changed',
      ticketId,
      fromStatus: 'broker-processing',
      toStatus: 'carrier-processing',
      reason: 'enviado para a operadora',
      authorId: DEV_LOGIN_USER_ID,
      authorType: 'user',
    })
    expect(item.id).toEqual(expect.any(String))
    expect(item.createdAt).toEqual(expect.any(String))
  })

  /* Nothing writes `automated_event` yet — ACE-58 will. The row is seeded
     directly so the timeline is proven to render it before that lands. */
  it('carries every field of an automated event item', async () => {
    await app.db
      .insertInto('ticket_comments')
      .values({
        ticket_id: ticketId,
        kind: 'automated_event',
        channel: 'internal',
        visibility: 'public',
        event_type: 'priority_changed',
        author_id: DEV_LOGIN_USER_ID,
        body: 'Prioridade alterada para urgente',
        metadata: { priority: 'urgent', previous: null },
      })
      .execute()

    const [item] = (await getTimeline()).json().data

    expect(item).toMatchObject({
      type: 'event',
      ticketId,
      eventType: 'priority_changed',
      body: 'Prioridade alterada para urgente',
      authorId: DEV_LOGIN_USER_ID,
      metadata: { priority: 'urgent', previous: null },
    })
  })

  it('returns an empty list for a ticket with no activity', async () => {
    const response = await getTimeline()

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual([])
  })

  it('returns 401 without session cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/timeline`,
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 404 for a nonexistent ticket', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/${NONEXISTENT_ID}/timeline`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error).toBe('NotFoundError')
  })
})
