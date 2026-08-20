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

  describe('GET /api/tickets', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/tickets' })

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('UnauthorizedError')
    })

    it('returns empty data when no tickets exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data).toEqual([])
      expect(response.json().total).toBe(0)
    })

    it('returns all tickets with pagination metadata', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data).toHaveLength(1)
      expect(body.total).toBe(1)
      expect(body.page).toBe(1)
      expect(body.pageSize).toBe(20)
    })

    it('filters by status', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const hit = await app.inject({
        method: 'GET',
        url: '/api/tickets?status=broker-processing',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(hit.json().total).toBe(1)

      const miss = await app.inject({
        method: 'GET',
        url: '/api/tickets?status=completed',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(miss.json().total).toBe(0)
    })

    it('filters by companyId', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const hit = await app.inject({
        method: 'GET',
        url: `/api/tickets?companyId=${validTicketBody.companyId}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(hit.json().total).toBe(1)

      const miss = await app.inject({
        method: 'GET',
        url: '/api/tickets?companyId=00000000-0000-4000-8000-000000000099',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(miss.json().total).toBe(0)
    })

    it('filters by queueId', async () => {
      const queueId = '00000000-0000-4000-8000-000000000010'
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, queueId },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const hit = await app.inject({
        method: 'GET',
        url: `/api/tickets?queueId=${queueId}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(hit.json().total).toBe(1)

      const miss = await app.inject({
        method: 'GET',
        url: '/api/tickets?queueId=00000000-0000-4000-8000-000000000099',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(miss.json().total).toBe(0)
    })

    it('filters by assigneeId', async () => {
      const assigneeId = '00000000-0000-4000-8000-000000000011'
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, assigneeId },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const hit = await app.inject({
        method: 'GET',
        url: `/api/tickets?assigneeId=${assigneeId}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(hit.json().total).toBe(1)

      const miss = await app.inject({
        method: 'GET',
        url: '/api/tickets?assigneeId=00000000-0000-4000-8000-000000000099',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(miss.json().total).toBe(0)
    })

    it('filters by enrollmentType', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const hit = await app.inject({
        method: 'GET',
        url: `/api/tickets?enrollmentType=${validTicketBody.enrollmentType}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(hit.json().total).toBe(1)

      const miss = await app.inject({
        method: 'GET',
        url: '/api/tickets?enrollmentType=exclusion',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(miss.json().total).toBe(0)
    })

    it('filters by sourceSystem', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const hit = await app.inject({
        method: 'GET',
        url: `/api/tickets?sourceSystem=${validTicketBody.sourceSystem}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(hit.json().total).toBe(1)

      const miss = await app.inject({
        method: 'GET',
        url: '/api/tickets?sourceSystem=other-system',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(miss.json().total).toBe(0)
    })

    it('filters by tags', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, tags: ['urgent', 'dental'] },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const hit = await app.inject({
        method: 'GET',
        url: '/api/tickets?tags=urgent',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(hit.json().total).toBe(1)

      const miss = await app.inject({
        method: 'GET',
        url: '/api/tickets?tags=health',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(miss.json().total).toBe(0)
    })

    it('searches by enrollment snapshot content', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, enrollmentSnapshot: { name: 'Maria Oliveira' } },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const hit = await app.inject({
        method: 'GET',
        url: '/api/tickets?search=Maria',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(hit.json().total).toBe(1)

      const miss = await app.inject({
        method: 'GET',
        url: '/api/tickets?search=João',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(miss.json().total).toBe(0)
    })

    it('paginates results correctly', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, enrollmentId: '00000000-0000-4000-8000-000000000002' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const page1 = await app.inject({
        method: 'GET',
        url: '/api/tickets?page=1&pageSize=1',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(page1.json().data).toHaveLength(1)
      expect(page1.json().total).toBe(2)

      const page2 = await app.inject({
        method: 'GET',
        url: '/api/tickets?page=2&pageSize=1',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(page2.json().data).toHaveLength(1)
      expect(page2.json().total).toBe(2)

      const id1 = page1.json().data[0].id
      const id2 = page2.json().data[0].id
      expect(id1).not.toBe(id2)
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
})
