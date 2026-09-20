import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

const DEV_LOGIN_USER_ID = 'dev@piposaude.com.br'
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000099'

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
  let ticketSessionCookie: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: {
        email: DEV_LOGIN_USER_ID,
        policies: ['admin/allow/administrate/pipodesk/structure'],
      },
    })
    sessionCookie = cookieValue(loginResponse, SESSION_COOKIE_NAME)!

    // Only the ticket door; the structure one is on sessionCookie.
    const ticketLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { email: DEV_LOGIN_USER_ID, policies: ['admin/allow/administrate/pipodesk/ticket'] },
    })
    ticketSessionCookie = cookieValue(ticketLogin, SESSION_COOKIE_NAME)!
  })

  afterAll(async () => {
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  /* `ticket_queues` before `ticket_groups`: the saved view holds the group with
     ON DELETE RESTRICT, so the reverse order fails as an FK violation in the
     next test, not this one. */
  afterEach(async () => {
    await app.db.deleteFrom('ticket_group_members').execute()
    await app.db.deleteFrom('tickets').execute()
    await app.db.deleteFrom('ticket_queues').execute()
    await app.db.deleteFrom('ticket_groups').execute()
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

    it('returns 403 for a session without the ticket policy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${NONEXISTENT_ID}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('ForbiddenError')
    })

    it('returns 404 for nonexistent queue', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${NONEXISTENT_ID}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
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
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
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
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: { ...validTicketBody, queueId: queueAId },
      })
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: {
          ...validTicketBody,
          enrollmentId: '00000000-0000-4000-8000-000000000011',
          queueId: queueBId,
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${queueAId}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
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
          cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
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
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
      })
      expect(page1.json().data).toHaveLength(2)
      expect(page1.json().total).toBe(3)
    })
  })

  // ---------------------------------------------------------------------------
  describe('the saved view the Queue carries', () => {
    /** The tree admits a single root, so everything but the first group hangs
     *  off one. */
    const group = async (name: string, parentId?: string): Promise<string> => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name, ...(parentId !== undefined && { parentId }) },
      })
      return response.json().id
    }

    it('creates a view with its group, owner, sort and grouping and reads them back', async () => {
      const groupId = await group('POD 5')

      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: {
          name: 'Minhas urgentes',
          groupId,
          ownerId: DEV_LOGIN_USER_ID,
          sort: { by: 'createdAt', direction: 'desc' },
          groupBy: 'company',
        },
      })

      expect(created.statusCode).toBe(201)
      expect(created.json()).toMatchObject({
        groupId,
        ownerId: DEV_LOGIN_USER_ID,
        sort: { by: 'createdAt', direction: 'desc' },
        groupBy: 'company',
      })

      const read = await app.inject({
        method: 'GET',
        url: `/api/queues/${created.json().id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(read.json()).toMatchObject({
        groupId,
        ownerId: DEV_LOGIN_USER_ID,
        sort: { by: 'createdAt', direction: 'desc' },
        groupBy: 'company',
      })
    })

    it('starts a team view on the default sort, with no grouping imposed', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Livres' },
      })

      expect(response.json()).toMatchObject({
        ownerId: null,
        groupId: null,
        sort: { by: 'actionDate', direction: 'asc' },
        groupBy: null,
      })
    })

    it('tells a view that imposes a flat list from one that imposes no grouping', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Lista plana', groupBy: 'none' },
      })

      expect(response.json().groupBy).toBe('none')
    })

    it('returns 400 for a sort field outside the contract', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila', sort: { by: 'beneficiary', direction: 'asc' } },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().details[0].field).toBe('sort.by')
    })

    it('returns 400 for a grouping outside the contract', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila', groupBy: 'carrier' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 422 for a group that does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Fila', groupId: NONEXISTENT_ID },
      })

      expect(response.statusCode).toBe(422)
      expect(response.json().details[0].field).toBe('groupId')
    })

    it('refuses a personal view owned by someone else', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'A fila da Ana', ownerId: 'ana@pipo.health' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('ForbiddenError')
    })

    it('moves a view to another group and changes its sort', async () => {
      const first = await group('GEBEN')
      const second = await group('POD 2', first)
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Livres', groupId: first },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${created.json().id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { groupId: second, sort: { by: 'status', direction: 'desc' }, groupBy: 'status' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        groupId: second,
        sort: { by: 'status', direction: 'desc' },
        groupBy: 'status',
      })
    })

    it('clears the grouping a view imposed', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Livres', groupBy: 'status' },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${created.json().id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { groupBy: null },
      })

      expect(response.json().groupBy).toBeNull()
    })
  })

  describe('the structure policy', () => {
    let withoutPolicy: string
    let withWholeProduct: string

    beforeAll(async () => {
      const anonymous = await app.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        payload: { email: DEV_LOGIN_USER_ID, policies: [] },
      })
      withoutPolicy = cookieValue(anonymous, SESSION_COOKIE_NAME)!

      const wholeProduct = await app.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        payload: { email: DEV_LOGIN_USER_ID, policies: ['admin/allow/administrate/pipodesk/*'] },
      })
      withWholeProduct = cookieValue(wholeProduct, SESSION_COOKIE_NAME)!
    })

    const routes: Array<[string, string]> = [
      ['GET', '/api/queues'],
      ['POST', '/api/queues'],
      ['GET', '/api/queues/:id'],
      ['PATCH', '/api/queues/:id'],
      ['DELETE', '/api/queues/:id'],
    ]

    it.each(routes)('answers 403 on %s %s for a session with no policy', async (method, url) => {
      const response = await app.inject({
        method: method as 'GET',
        url: url.replace(':id', NONEXISTENT_ID),
        cookies: { [SESSION_COOKIE_NAME]: withoutPolicy },
        payload: method === 'GET' || method === 'DELETE' ? undefined : { name: 'Fila' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('ForbiddenError')
    })

    // The wildcard only ever matches on the session side (see policy.test.ts).
    it('opens the route for a session holding the whole product', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: withWholeProduct },
      })

      expect(response.statusCode).toBe(200)
    })

    // 404, not 403: the wildcard covers both families, so the route reaches the lookup.
    it('opens the tickets of a queue for a session holding the whole product', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${NONEXISTENT_ID}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: withWholeProduct },
      })

      expect(response.statusCode).toBe(404)
    })

    it('answers 403 on the tickets of a queue for the structure policy alone', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${NONEXISTENT_ID}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('ForbiddenError')
    })

    it('answers 403 for a session holding only the ticket policy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
