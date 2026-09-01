import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
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

describe('comments routes', () => {
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

    const ticketResponse = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      payload: validTicketBody,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })
    ticketId = ticketResponse.json().id
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('tickets').execute()
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_comments').execute()
  })

  describe('GET /api/tickets/:id/comments', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/tickets/${ticketId}/comments`,
      })
      expect(response.statusCode).toBe(401)
    })

    it('returns 404 for nonexistent ticket', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/tickets/${NONEXISTENT_ID}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NotFoundError')
    })

    it('returns empty list when no comments exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().data).toEqual([])
    })

    it('returns comments in chronological order', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { visibility: 'public', body: 'primeiro' },
      })
      await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { visibility: 'private', body: 'segundo' },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const { data } = response.json()
      expect(data).toHaveLength(2)
      expect(data[0].body).toBe('primeiro')
      expect(data[1].body).toBe('segundo')
    })
  })

  describe('POST /api/tickets/:id/comments', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        payload: { visibility: 'public', body: 'hello' },
      })
      expect(response.statusCode).toBe(401)
    })

    it('returns 404 for nonexistent ticket', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${NONEXISTENT_ID}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { visibility: 'public', body: 'hello' },
      })
      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NotFoundError')
    })

    it('returns 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { visibility: 'public' },
      })
      expect(response.statusCode).toBe(400)
    })

    it('creates a public comment and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { visibility: 'public', body: 'comentário público' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.id).toBeTruthy()
      expect(body.ticketId).toBe(ticketId)
      expect(body.kind).toBe('manual')
      expect(body.channel).toBe('internal')
      expect(body.visibility).toBe('public')
      expect(body.body).toBe('comentário público')
      expect(body.authorId).toBe(DEV_LOGIN_USER_ID)
      expect(body.eventType).toBeNull()
      expect(body.metadata).toEqual({})
    })

    it('creates a private comment and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { visibility: 'private', body: 'anotação interna' },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().visibility).toBe('private')
    })
  })
})
