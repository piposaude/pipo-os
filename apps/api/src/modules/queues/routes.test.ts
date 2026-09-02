import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

const DEV_LOGIN_USER_ID = 'dev@piposaude.com.br'
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000099'
const GROUP_ID = '00000000-0000-4000-8000-000000000001'
const GROUP_ID_2 = '00000000-0000-4000-8000-000000000002'

const validTicketBody = {
  enrollmentId: '00000000-0000-4000-8000-000000000010',
  enrollmentType: 'inclusion',
  companyId: '00000000-0000-4000-8000-000000000002',
  sourceSystem: 'enrollment-integrations',
  enrollmentSnapshot: { name: 'Test User' },
}

function cookieValue(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string | null {
  return response.cookies.find((cookie) => cookie.name === name)?.value ?? null
}

describe('queues routes', () => {
  let app: FastifyInstance
  let sessionCookie: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { email: DEV_LOGIN_USER_ID, policies: [] },
    })
    sessionCookie = cookieValue(loginResponse, SESSION_COOKIE_NAME)!
  })

  afterAll(async () => {
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_queues_x_group').execute()
    await app.db.deleteFrom('ticket_group_members').execute()
    await app.db.deleteFrom('tickets').execute()
    await app.db.deleteFrom('ticket_groups').execute()
    await app.db.deleteFrom('ticket_queues').execute()
  })

  // ---------------------------------------------------------------------------
  describe('POST /api/queues', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        payload: { name: 'Fila A' },
      })
      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('UnauthorizedError')
    })

    it('creates a queue and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const body = response.json()

      expect(response.statusCode).toBe(201)
      expect(body.name).toBe('Fila A')
      expect(body.filters).toEqual({})
      expect(body.createdBy).toBe(DEV_LOGIN_USER_ID)
      expect(body.id).toBeDefined()
      expect(body.createdAt).toBeDefined()
      expect(body.updatedAt).toBeDefined()
    })

    it('creates a queue with custom filters', async () => {
      const filters = {
        statuses: ['broker-processing', 'missing-documents'],
        tags: ['vip'],
        assigneeIds: ['@me', null],
        priorities: ['urgent', null],
        urgentBy: '2026-09-01',
      }
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila B', filters },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().filters).toEqual(filters)
    })

    it('returns 400 for a filter field that is not in the contract', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila C', filters: { status: 'broker-processing' } },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for a status outside the eight the API stores', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila D', filters: { statuses: ['open'] } },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 without name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: {},
      })
      expect(response.statusCode).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  describe('GET /api/queues', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/queues' })
      expect(response.statusCode).toBe(401)
    })

    it('returns empty list when no queues exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ data: [], total: 0, page: 1, pageSize: 20 })
    })

    it('reads a legacy filter as null instead of failing the whole list', async () => {
      await app.db
        .insertInto('ticket_queues')
        .values({
          name: 'Fila E',
          filters: JSON.stringify({ status: 'active', tags: ['vip'] }),
          created_by: DEV_LOGIN_USER_ID,
        })
        .execute()

      const response = await app.inject({
        method: 'GET',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data[0].filters).toBeNull()
    })

    it('keeps an empty filter distinguishable from an unreadable one', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila F' },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.json().data[0].filters).toEqual({})
    })

    it('returns created queues', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila B' },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const body = response.json()

      expect(response.statusCode).toBe(200)
      expect(body.total).toBe(2)
      expect(body.data).toHaveLength(2)
    })

    it('paginates correctly across pages', async () => {
      for (let i = 1; i <= 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/queues',
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
          payload: { name: `Fila ${i}` },
        })
      }

      const page1 = await app.inject({
        method: 'GET',
        url: '/api/queues?page=1&pageSize=2',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(page1.json().data).toHaveLength(2)
      expect(page1.json().total).toBe(3)

      const page2 = await app.inject({
        method: 'GET',
        url: '/api/queues?page=2&pageSize=2',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(page2.json().data).toHaveLength(1)
      expect(page2.json().total).toBe(3)

      const page99 = await app.inject({
        method: 'GET',
        url: '/api/queues?page=99&pageSize=2',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(page99.json().data).toHaveLength(0)
      expect(page99.json().total).toBe(3)
    })
  })

  // ---------------------------------------------------------------------------
  describe('GET /api/queues/:id', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({ method: 'GET', url: `/api/queues/${NONEXISTENT_ID}` })
      expect(response.statusCode).toBe(401)
    })

    it('returns 404 for nonexistent queue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${NONEXISTENT_ID}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(404)
    })

    it('returns the queue', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().id).toBe(id)
      expect(response.json().name).toBe('Fila A')
    })
  })

  // ---------------------------------------------------------------------------
  describe('PATCH /api/queues/:id', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${NONEXISTENT_ID}`,
        payload: { name: 'Nova' },
      })
      expect(response.statusCode).toBe(401)
    })

    it('returns 404 for nonexistent queue', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${NONEXISTENT_ID}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Nova' },
      })
      expect(response.statusCode).toBe(404)
    })

    it('updates queue name and refreshes updatedAt', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila Original' },
      })
      const { id, updatedAt: originalUpdatedAt } = created.json()

      await new Promise((r) => setTimeout(r, 5))

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila Renomeada' },
      })
      const body = response.json()

      expect(response.statusCode).toBe(200)
      expect(body.name).toBe('Fila Renomeada')
      expect(body.updatedBy).toBe(DEV_LOGIN_USER_ID)
      expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
        new Date(originalUpdatedAt).getTime(),
      )
    })

    it('updates queue filters', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { filters: { priorities: ['high'] } },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().filters).toEqual({ priorities: ['high'] })
    })

    it('returns 400 for empty body', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: {},
      })
      expect(response.statusCode).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  describe('DELETE /api/queues/:id', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${NONEXISTENT_ID}`,
      })
      expect(response.statusCode).toBe(401)
    })

    it('returns 404 for nonexistent queue', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${NONEXISTENT_ID}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(404)
    })

    it('deletes the queue and returns 204', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id } = created.json()

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(deleteResponse.statusCode).toBe(204)

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(getResponse.statusCode).toBe(404)
    })

    it('returns 409 when queue still has groups', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id: queueId } = created.json()

      await app.db
        .insertInto('ticket_groups')
        .values({ id: GROUP_ID, name: 'Grupo A', created_by: DEV_LOGIN_USER_ID })
        .execute()

      await app.db
        .insertInto('ticket_queues_x_group')
        .values({ queue_id: queueId, group_id: GROUP_ID })
        .execute()

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${queueId}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(409)
      expect(response.json().error).toBe('ConflictError')
    })
  })

  // ---------------------------------------------------------------------------
  describe('GET /api/queues/:id/tickets', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${NONEXISTENT_ID}/tickets`,
      })
      expect(response.statusCode).toBe(401)
    })

    it('returns 404 for nonexistent queue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${NONEXISTENT_ID}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(404)
    })

    it('returns empty list when no tickets in the queue', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id: queueId } = created.json()

      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${queueId}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ data: [], total: 0, page: 1, pageSize: 20 })
    })

    it('returns only tickets of this queue', async () => {
      const queueA = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const queueB = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila B' },
      })
      const queueAId = queueA.json().id
      const queueBId = queueB.json().id

      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { ...validTicketBody, queueId: queueAId },
      })
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: {
          ...validTicketBody,
          enrollmentId: '00000000-0000-4000-8000-000000000011',
          queueId: queueBId,
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${queueAId}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const body = response.json()

      expect(response.statusCode).toBe(200)
      expect(body.total).toBe(1)
      expect(body.data).toHaveLength(1)
      expect(body.data[0].queueId).toBe(queueAId)
    })

    it('paginates tickets within the queue', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id: queueId } = created.json()

      for (let i = 1; i <= 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/tickets',
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
          payload: {
            ...validTicketBody,
            enrollmentId: `00000000-0000-4000-8000-00000000001${i}`,
            queueId,
          },
        })
      }

      const page1 = await app.inject({
        method: 'GET',
        url: `/api/queues/${queueId}/tickets?page=1&pageSize=2`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(page1.json().data).toHaveLength(2)
      expect(page1.json().total).toBe(3)
    })
  })

  // ---------------------------------------------------------------------------
  describe('POST /api/queues/:id/groups', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/queues/${NONEXISTENT_ID}/groups`,
        payload: { groupId: GROUP_ID },
      })
      expect(response.statusCode).toBe(401)
    })

    it('returns 404 when queue does not exist', async () => {
      await app.db
        .insertInto('ticket_groups')
        .values({ id: GROUP_ID, name: 'Grupo A', created_by: DEV_LOGIN_USER_ID })
        .execute()

      const response = await app.inject({
        method: 'POST',
        url: `/api/queues/${NONEXISTENT_ID}/groups`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { groupId: GROUP_ID },
      })
      expect(response.statusCode).toBe(404)
    })

    it('returns 404 when group does not exist', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id: queueId } = created.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/queues/${queueId}/groups`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { groupId: NONEXISTENT_ID },
      })
      expect(response.statusCode).toBe(404)
      expect(response.json().message).toContain('Group')
    })

    it('links group to queue and returns 201', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id: queueId } = created.json()

      await app.db
        .insertInto('ticket_groups')
        .values({ id: GROUP_ID, name: 'Grupo A', created_by: DEV_LOGIN_USER_ID })
        .execute()

      const response = await app.inject({
        method: 'POST',
        url: `/api/queues/${queueId}/groups`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { groupId: GROUP_ID },
      })
      const body = response.json()

      expect(response.statusCode).toBe(201)
      expect(body.queueId).toBe(queueId)
      expect(body.groupId).toBe(GROUP_ID)
      expect(body.createdAt).toBeDefined()
    })

    it('returns 409 when group is already linked to queue', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id: queueId } = created.json()

      await app.db
        .insertInto('ticket_groups')
        .values({ id: GROUP_ID, name: 'Grupo A', created_by: DEV_LOGIN_USER_ID })
        .execute()

      await app.inject({
        method: 'POST',
        url: `/api/queues/${queueId}/groups`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { groupId: GROUP_ID },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/queues/${queueId}/groups`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { groupId: GROUP_ID },
      })
      expect(response.statusCode).toBe(409)
      expect(response.json().error).toBe('ConflictError')
    })
  })

  // ---------------------------------------------------------------------------
  describe('DELETE /api/queues/:id/groups/:groupId', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${NONEXISTENT_ID}/groups/${GROUP_ID}`,
      })
      expect(response.statusCode).toBe(401)
    })

    it('returns 404 when queue does not exist', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${NONEXISTENT_ID}/groups/${GROUP_ID}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(404)
    })

    it('returns 404 when link does not exist', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id: queueId } = created.json()

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${queueId}/groups/${NONEXISTENT_ID}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(404)
    })

    it('removes link and returns 204', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id: queueId } = created.json()

      await app.db
        .insertInto('ticket_groups')
        .values({ id: GROUP_ID, name: 'Grupo A', created_by: DEV_LOGIN_USER_ID })
        .execute()

      await app.inject({
        method: 'POST',
        url: `/api/queues/${queueId}/groups`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { groupId: GROUP_ID },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${queueId}/groups/${GROUP_ID}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(204)
    })

    it('allows re-linking after removal', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila A' },
      })
      const { id: queueId } = created.json()

      await app.db
        .insertInto('ticket_groups')
        .values([
          { id: GROUP_ID, name: 'Grupo A', created_by: DEV_LOGIN_USER_ID },
          { id: GROUP_ID_2, name: 'Grupo B', created_by: DEV_LOGIN_USER_ID },
        ])
        .execute()

      await app.inject({
        method: 'POST',
        url: `/api/queues/${queueId}/groups`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { groupId: GROUP_ID },
      })

      await app.inject({
        method: 'DELETE',
        url: `/api/queues/${queueId}/groups/${GROUP_ID}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const relink = await app.inject({
        method: 'POST',
        url: `/api/queues/${queueId}/groups`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { groupId: GROUP_ID },
      })
      expect(relink.statusCode).toBe(201)
    })
  })
})
