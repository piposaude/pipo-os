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

const validTicketBody = {
  enrollmentId: '00000000-0000-4000-8000-000000000001',
  enrollmentType: 'inclusion',
  companyId: '00000000-0000-4000-8000-000000000002',
  sourceSystem: 'enrollment-integrations',
  enrollmentSnapshot: { name: 'Test User' },
}

describe('tickets routes', () => {
  let app: FastifyInstance
  let sessionCookie: string

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
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  afterEach(async () => {
    await app.db.deleteFrom('tickets').execute()
  })

  describe('POST /api/tickets', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('UnauthorizedError')
    })

    it('creates a ticket and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.id).toBeTruthy()
      expect(body.enrollmentId).toBe(validTicketBody.enrollmentId)
      expect(body.enrollmentType).toBe(validTicketBody.enrollmentType)
      expect(body.companyId).toBe(validTicketBody.companyId)
      expect(body.sourceSystem).toBe(validTicketBody.sourceSystem)
      expect(body.status).toBe('broker-processing')
      expect(body.tags).toEqual([])
      expect(body.forceCompletion).toBe(false)
    })

    it('returns 409 when enrollment already has an open ticket', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().error).toBe('ConflictError')
    })

    it('returns 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { enrollmentId: '00000000-0000-4000-8000-000000000001' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /api/tickets/:id', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tickets/00000000-0000-4000-8000-000000000099',
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('UnauthorizedError')
    })

    it('returns 404 for a non-existent ticket', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tickets/00000000-0000-4000-8000-000000000099',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NotFoundError')
    })

    it('returns the ticket for a valid id', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().id).toBe(id)
      expect(response.json().enrollmentId).toBe(validTicketBody.enrollmentId)
    })
  })
})
