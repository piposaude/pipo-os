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
    await app.db.deleteFrom('ticket_form_values').execute()
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

  describe('PATCH /api/tickets/:id', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tickets/00000000-0000-4000-8000-000000000099',
        payload: { status: 'completed' },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('UnauthorizedError')
    })

    it('returns 404 for a non-existent ticket', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tickets/00000000-0000-4000-8000-000000000099',
        payload: { status: 'completed' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NotFoundError')
    })

    it('updates ticket status and returns 200', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}`,
        payload: { status: 'carrier-processing' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('carrier-processing')
    })

    it('accepts null to clear a nullable field', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, queueId: '00000000-0000-4000-8000-000000000010' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}`,
        payload: { queueId: null },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().queueId).toBeNull()
    })

    it('returns 400 for an empty body', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}`,
        payload: {},
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('GET /api/tickets/:id/form-values', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tickets/00000000-0000-4000-8000-000000000099/form-values',
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('UnauthorizedError')
    })

    it('returns 404 for a non-existent ticket', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tickets/00000000-0000-4000-8000-000000000099/form-values',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NotFoundError')
    })

    it('returns empty array for ticket with no form-values', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/form-values`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns form-values after upsert', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}/form-values`,
        payload: [{ fieldKey: 'cpf', fieldValue: '123.456.789-00' }],
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/form-values`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(1)
      expect(response.json()[0].fieldKey).toBe('cpf')
    })
  })

  describe('PATCH /api/tickets/:id/form-values', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tickets/00000000-0000-4000-8000-000000000099/form-values',
        payload: [{ fieldKey: 'cpf', fieldValue: '123' }],
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('UnauthorizedError')
    })

    it('returns 404 for a non-existent ticket', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tickets/00000000-0000-4000-8000-000000000099/form-values',
        payload: [{ fieldKey: 'cpf', fieldValue: '123' }],
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NotFoundError')
    })

    it('creates form-values and returns them', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}/form-values`,
        payload: [
          { fieldKey: 'cpf', fieldValue: '123.456.789-00' },
          { fieldKey: 'name', fieldValue: 'Test User' },
        ],
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(2)
      expect(response.json().map((v: { fieldKey: string }) => v.fieldKey)).toEqual(
        expect.arrayContaining(['cpf', 'name']),
      )
    })

    it('upserts — overwrites existing value and keeps others', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}/form-values`,
        payload: [
          { fieldKey: 'cpf', fieldValue: 'old-value' },
          { fieldKey: 'name', fieldValue: 'Test User' },
        ],
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}/form-values`,
        payload: [{ fieldKey: 'cpf', fieldValue: 'new-value' }],
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveLength(2)
      const cpf = response.json().find((v: { fieldKey: string }) => v.fieldKey === 'cpf')
      expect(cpf.fieldValue).toBe('new-value')
    })

    it('returns 400 for an empty array', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}/form-values`,
        payload: [],
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when fieldValue is omitted', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}/form-values`,
        payload: [{ fieldKey: 'cpf' }],
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })
  })
})
