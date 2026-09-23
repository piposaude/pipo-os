import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
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
  let rootGroupId: string
  let sessionCookie: string
  let ticketId: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
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
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
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

    it('types the row as written by a user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { visibility: 'private', body: 'anotação' },
      })
      expect(response.statusCode).toBe(201)

      const row = await app.db
        .selectFrom('ticket_comments')
        .select('author_type')
        .where('id', '=', response.json().id)
        .executeTakeFirstOrThrow()

      expect(row.author_type).toBe('user')
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

    it('accepts a long comment under the limit', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { visibility: 'private', body: 'a'.repeat(50_000) },
      })

      expect(response.statusCode).toBe(201)
    })

    it('refuses a comment past the field limit with 400, naming the field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { visibility: 'private', body: 'a'.repeat(150_000) },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().details).toEqual([
        { field: 'body', message: expect.any(String), code: 'too_big' },
      ])
    })

    // Past the route's own bodyLimit the payload never reaches the schema, so
    // this is the only refusal the caller can get without the field name.
    it('refuses a payload past the route limit with 413', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { visibility: 'private', body: 'a'.repeat(300_000) },
      })

      expect(response.statusCode).toBe(413)
    })
  })
  describe('the ticket policy', () => {
    let withoutPolicy: string

    beforeAll(async () => {
      const anonymous = await app.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        payload: { policies: [] },
      })
      withoutPolicy = cookieValue(anonymous, SESSION_COOKIE_NAME)!
    })

    const routes: Array<[string, string]> = [
      ['GET', '/api/tickets/:id/comments'],
      ['GET', '/api/tickets/:id/timeline'],
      ['POST', '/api/tickets/:id/comments'],
    ]

    it.each(routes)('answers 403 on %s %s for a session with no policy', async (method, url) => {
      const response = await app.inject({
        method: method as 'GET',
        url: url.replace(':id', ticketId),
        cookies: { [SESSION_COOKIE_NAME]: withoutPolicy },
        payload: method === 'GET' ? undefined : { visibility: 'private', body: 'nope' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('ForbiddenError')
    })
  })
})
