import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { sessionCookieFor } from '../auth/session.test-helpers.js'

const DEV_LOGIN_USER_ID = 'dev@piposaude.com.br'

const { defaultSort } = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../../contract/ticket-queue-view.json', import.meta.url)),
    'utf-8',
  ),
) as { defaultSort: { by: string; direction: string } }
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
  const clean = async (): Promise<void> => {
    await app.db.deleteFrom('ticket_queue_favorites').execute()
    await app.db.deleteFrom('ticket_group_members').execute()
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('tickets').execute()
    await app.db.deleteFrom('ticket_queues').execute()
    await app.db.deleteFrom('ticket_groups').execute()
  }

  // Before as well as after: a group left behind by another file would take the
  // single root this file's tree needs.
  beforeEach(clean)
  afterEach(clean)

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

    it('lists what the saved filter selects, not what points at the queue', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Urgentes', filters: { priorities: ['urgent'] } },
      })
      const { id: queueId } = created.json()

      const inside = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: validTicketBody,
      })
      // Points at the view and is outside its filter: the old model listed it.
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: {
          ...validTicketBody,
          enrollmentId: '00000000-0000-4000-8000-000000000011',
          queueId,
        },
      })
      // Priority has no door in the create body, so the column is written here.
      await app.db
        .updateTable('tickets')
        .set({ priority: 'urgent' })
        .where('id', '=', inside.json().id)
        .execute()

      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${queueId}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
      })
      const body = response.json()

      expect(response.statusCode).toBe(200)
      expect(body.total).toBe(1)
      expect(body.data.map((ticket: { id: string }) => ticket.id)).toEqual([inside.json().id])
    })

    it('resolves @me against the viewer, so a shared view shows each their own', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Meus', filters: { assigneeIds: ['@me'] } },
      })
      const { id: queueId } = created.json()

      const mine = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: { ...validTicketBody, assigneeId: DEV_LOGIN_USER_ID },
      })
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: {
          ...validTicketBody,
          enrollmentId: '00000000-0000-4000-8000-000000000011',
          assigneeId: 'ana@pipo.health',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${queueId}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
      })

      expect(response.json().data.map((ticket: { id: string }) => ticket.id)).toEqual([
        mine.json().id,
      ])
    })

    it('orders by the sort the view saved', async () => {
      const ticket = async (enrollmentId: string, actionDate: string): Promise<string> => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
          payload: { ...validTicketBody, enrollmentId, actionDate },
        })
        return response.json().id
      }
      const later = await ticket('00000000-0000-4000-8000-000000000021', '2026-10-10T00:00:00.000Z')
      const sooner = await ticket(
        '00000000-0000-4000-8000-000000000022',
        '2026-09-01T00:00:00.000Z',
      )

      const view = async (name: string, direction: string): Promise<string> => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/queues',
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
          payload: { name, sort: { by: 'actionDate', direction } },
        })
        return response.json().id
      }
      // `window=all`: both dates are far enough ahead to be asleep, and the
      // order is what this test is about.
      const ids = async (queueId: string): Promise<string[]> => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueId}/tickets?window=all`,
          cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        })
        return response.json().data.map((ticket: { id: string }) => ticket.id)
      }

      expect(await ids(await view('Prazo', 'asc'))).toEqual([sooner, later])
      expect(await ids(await view('Prazo invertido', 'desc'))).toEqual([later, sooner])
    })

    it('sinks a ticket with no action date to the end, whichever the direction', async () => {
      const dated = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: { ...validTicketBody, actionDate: '2026-10-10T00:00:00.000Z' },
      })
      const undated = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: { ...validTicketBody, enrollmentId: '00000000-0000-4000-8000-000000000023' },
      })

      for (const direction of ['asc', 'desc'] as const) {
        const created = await app.inject({
          method: 'POST',
          url: '/api/queues',
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
          payload: { name: `Prazo ${direction}`, sort: { by: 'actionDate', direction } },
        })
        const response = await app.inject({
          method: 'GET',
          url: `/api/queues/${created.json().id}/tickets?window=all`,
          cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        })

        expect(response.json().data.map((ticket: { id: string }) => ticket.id)).toEqual([
          dated.json().id,
          undated.json().id,
        ])
      }
    })

    it('orders by status in the triage order the queue shows, not alphabetically', async () => {
      const ticket = async (enrollmentId: string, status: string): Promise<string> => {
        const created = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
          payload: { ...validTicketBody, enrollmentId },
        })
        await app.db
          .updateTable('tickets')
          .set({ status })
          .where('id', '=', created.json().id)
          .execute()
        return created.json().id
      }
      const carrier = await ticket('00000000-0000-4000-8000-000000000031', 'carrier-processing')
      const broker = await ticket('00000000-0000-4000-8000-000000000032', 'broker-open-issue')
      const client = await ticket('00000000-0000-4000-8000-000000000033', 'missing-documents')

      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Por situação', sort: { by: 'status', direction: 'asc' } },
      })
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${created.json().id}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
      })

      expect(response.json().data.map((ticket: { id: string }) => ticket.id)).toEqual([
        broker,
        client,
        carrier,
      ])
    })

    it('leaves out what is closed or still asleep, as the queue does', async () => {
      const open = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: validTicketBody,
      })
      const closed = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: { ...validTicketBody, enrollmentId: '00000000-0000-4000-8000-000000000051' },
      })
      await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${closed.json().id}/status`,
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: { status: 'completed' },
      })
      const asleep = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: {
          ...validTicketBody,
          enrollmentId: '00000000-0000-4000-8000-000000000052',
          actionDate: '2099-01-01T00:00:00.000Z',
        },
      })

      const created = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Todos' },
      })
      const { id: queueId } = created.json()

      const ids = async (query = ''): Promise<string[]> => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/queues/${queueId}/tickets${query}`,
          cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        })
        return response.json().data.map((ticket: { id: string }) => ticket.id)
      }

      expect(await ids()).toEqual([open.json().id])
      expect(await ids('?window=sleeping')).toEqual([asleep.json().id])
      expect((await ids('?window=all')).sort()).toEqual(
        [open.json().id, closed.json().id, asleep.json().id].sort(),
      )
    })

    it('paginates what the filter selects', async () => {
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

    it('reads ownerId null as the team view the read returns', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Livres', ownerId: null },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().ownerId).toBeNull()
    })

    // Against the contract, not against a literal: the default that decides is
    // the DEFAULT of the column, and this is what holds the two together.
    it('starts a team view on the default sort of the contract, with no grouping imposed', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'Livres' },
      })

      expect(response.json()).toMatchObject({
        ownerId: null,
        groupId: null,
        sort: defaultSort,
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

  // ---------------------------------------------------------------------------
  describe('who may edit a saved view', () => {
    const ANALYST = 'ana@pipo.health'
    const POD_LEAD = 'carla@pipo.health'
    const GEBEN_LEAD = 'bruna@pipo.health'

    let analyst: string
    let podLead: string
    let gebenLead: string
    let geben: string
    let pod: string

    const login = (email: string): string =>
      sessionCookieFor(app, email, ['admin/allow/administrate/pipodesk/ticket'])

    const member = async (groupId: string, userId: string, role: string): Promise<void> => {
      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { userId, role },
      })
    }

    const queue = async (
      payload: Record<string, unknown>,
      cookie = sessionCookie,
    ): Promise<string> => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: cookie },
        payload,
      })
      return response.json().id
    }

    beforeAll(() => {
      analyst = login(ANALYST)
      podLead = login(POD_LEAD)
      gebenLead = login(GEBEN_LEAD)
    })

    beforeEach(async () => {
      const root = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'GEBEN' },
      })
      geben = root.json().id
      const child = await app.inject({
        method: 'POST',
        url: '/api/groups',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name: 'POD 5', parentId: geben },
      })
      pod = child.json().id

      await member(pod, ANALYST, 'member')
      await member(pod, POD_LEAD, 'admin')
      await member(geben, GEBEN_LEAD, 'admin')
    })

    it('keeps the personal view of someone else out of the listing', async () => {
      await queue({ name: 'Livres', groupId: pod })
      await queue({ name: 'Da Carla', groupId: pod, ownerId: POD_LEAD }, podLead)

      const response = await app.inject({
        method: 'GET',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: analyst },
      })

      expect(response.json().data.map((view: { name: string }) => view.name)).toEqual(['Livres'])
      expect(response.json().total).toBe(1)
    })

    it('keeps the personal view of someone else out of the counts', async () => {
      const team = await queue({ name: 'Livres', groupId: pod })
      const hers = await queue({ name: 'Da Carla', groupId: pod, ownerId: POD_LEAD }, podLead)

      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/counts?ids=${team}&ids=${hers}`,
        cookies: { [SESSION_COOKIE_NAME]: analyst },
      })

      expect(response.json().data.map((row: { queueId: string }) => row.queueId)).toEqual([team])
    })

    it('lets an analyst create a personal view with the ticket policy alone', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: analyst },
        payload: { name: 'Minhas', groupId: pod, ownerId: ANALYST },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().ownerId).toBe(ANALYST)
    })

    it('refuses an analyst creating a team view in their pod', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: analyst },
        payload: { name: 'Livres', groupId: pod },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('ForbiddenError')
    })

    it('refuses an analyst editing the team view of their pod', async () => {
      const id = await queue({ name: 'Livres', groupId: pod })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: analyst },
        payload: { name: 'Livres (minha versão)' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('lets an analyst edit their own personal view', async () => {
      const id = await queue({ name: 'Minhas', groupId: pod, ownerId: ANALYST }, analyst)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: analyst },
        payload: { name: 'Minhas urgentes' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('refuses an analyst editing the personal view of someone else', async () => {
      const id = await queue({ name: 'Da Carla', groupId: pod, ownerId: POD_LEAD }, podLead)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: analyst },
        payload: { name: 'Minha agora' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('lets the coordination of the pod edit its team view', async () => {
      const id = await queue({ name: 'Livres', groupId: pod })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: podLead },
        payload: { sort: { by: 'updatedAt', direction: 'desc' } },
      })

      expect(response.statusCode).toBe(200)
    })

    it('lets the coordination of an ancestor edit the view of a child pod', async () => {
      const id = await queue({ name: 'Livres', groupId: pod })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: gebenLead },
        payload: { name: 'Livres do POD 5' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('refuses the coordination of a pod editing the view of its parent', async () => {
      const id = await queue({ name: 'Todos', groupId: geben })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: podLead },
        payload: { name: 'Todos os meus' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('refuses an analyst deleting the team view of their pod', async () => {
      const id = await queue({ name: 'Livres', groupId: pod })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: analyst },
      })

      expect(response.statusCode).toBe(403)
    })

    it('lets the owner delete their personal view', async () => {
      const id = await queue({ name: 'Minhas', groupId: pod, ownerId: ANALYST }, analyst)

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: analyst },
      })

      expect(response.statusCode).toBe(204)
    })

    it('refuses the coordination taking the team view for themselves', async () => {
      const id = await queue({ name: 'Livres', groupId: pod })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: podLead },
        payload: { ownerId: POD_LEAD },
      })

      expect(response.statusCode).toBe(403)
    })

    it('refuses an analyst handing their personal view to the team', async () => {
      const id = await queue({ name: 'Minhas', groupId: pod, ownerId: ANALYST }, analyst)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: analyst },
        payload: { ownerId: null },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // ---------------------------------------------------------------------------
  describe('GET /api/queues/counts', () => {
    const view = async (name: string, filters?: Record<string, unknown>): Promise<string> => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name, ...(filters !== undefined && { filters }) },
      })
      return response.json().id
    }

    const ticket = async (enrollmentId: string, assigneeId?: string): Promise<void> => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: {
          ...validTicketBody,
          enrollmentId,
          ...(assigneeId !== undefined && { assigneeId }),
        },
      })
    }

    const counts = async (ids: string[], cookie = ticketSessionCookie): Promise<unknown> => {
      const query = ids.map((id) => `ids=${id}`).join('&')
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/counts?${query}`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      })
      return response.json()
    }

    it('counts each view by its own filter', async () => {
      const mine = await view('Meus', { assigneeIds: ['@me'] })
      const all = await view('Todos')
      await ticket('00000000-0000-4000-8000-000000000041', DEV_LOGIN_USER_ID)
      await ticket('00000000-0000-4000-8000-000000000042', 'ana@pipo.health')

      expect(await counts([mine, all])).toEqual({
        data: [
          { queueId: mine, total: 1 },
          { queueId: all, total: 2 },
        ],
      })
    })

    it('counts what the same view lists', async () => {
      const id = await view('Meus', { assigneeIds: ['@me'] })
      await ticket('00000000-0000-4000-8000-000000000043', DEV_LOGIN_USER_ID)

      const listed = await app.inject({
        method: 'GET',
        url: `/api/queues/${id}/tickets`,
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
      })

      expect(await counts([id])).toEqual({ data: [{ queueId: id, total: listed.json().total }] })
    })

    it('answers in the order the ids were asked for', async () => {
      const first = await view('Primeira')
      const second = await view('Segunda')

      const asked = await counts([second, first])

      expect((asked as { data: { queueId: string }[] }).data.map((row) => row.queueId)).toEqual([
        second,
        first,
      ])
    })

    it('counts the same window the queue shows', async () => {
      const id = await view('Todos')
      await ticket('00000000-0000-4000-8000-000000000061')
      const closed = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: { ...validTicketBody, enrollmentId: '00000000-0000-4000-8000-000000000062' },
      })
      await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${closed.json().id}/status`,
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
        payload: { status: 'completed' },
      })

      expect(await counts([id])).toEqual({ data: [{ queueId: id, total: 1 }] })

      const all = await app.inject({
        method: 'GET',
        url: `/api/queues/counts?ids=${id}&window=all`,
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
      })
      expect(all.json()).toEqual({ data: [{ queueId: id, total: 2 }] })
    })

    it('leaves out a view that does not exist', async () => {
      const id = await view('Todos')

      expect(await counts([id, NONEXISTENT_ID])).toEqual({ data: [{ queueId: id, total: 0 }] })
    })

    it('refuses more ids than one sidebar could ever ask for', async () => {
      const ids = Array.from(
        { length: 51 },
        (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      )
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/counts?${ids.map((id) => `ids=${id}`).join('&')}`,
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('refuses a call with no id at all', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/queues/counts',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  describe('favouriting a view', () => {
    const OTHER = 'ana@pipo.health'
    let other: string

    const queue = async (name: string): Promise<string> => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { name },
      })
      return response.json().id
    }

    const read = async (id: string, cookie: string): Promise<Record<string, unknown>> => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/queues/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      })
      return response.json()
    }

    beforeAll(() => {
      other = sessionCookieFor(app, OTHER, ['admin/allow/administrate/pipodesk/ticket'])
    })

    it('reads a view nobody starred as not favourite', async () => {
      const id = await queue('Livres')

      expect((await read(id, sessionCookie)).favorite).toBe(false)
    })

    it('stars a view for the viewer who asked', async () => {
      const id = await queue('Livres')

      const response = await app.inject({
        method: 'POST',
        url: `/api/queues/${id}/favorite`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(204)
      expect((await read(id, sessionCookie)).favorite).toBe(true)
    })

    it('keeps the star personal: nobody else sees it', async () => {
      const id = await queue('Livres')
      await app.inject({
        method: 'POST',
        url: `/api/queues/${id}/favorite`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect((await read(id, other)).favorite).toBe(false)
    })

    it('stars twice without duplicating the row or failing', async () => {
      const id = await queue('Livres')

      for (let i = 0; i < 2; i += 1) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/queues/${id}/favorite`,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(response.statusCode).toBe(204)
      }

      const rows = await app.db.selectFrom('ticket_queue_favorites').selectAll().execute()
      expect(rows).toHaveLength(1)
    })

    it('unstars what was never starred', async () => {
      const id = await queue('Livres')

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/queues/${id}/favorite`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(204)
      expect((await read(id, sessionCookie)).favorite).toBe(false)
    })

    it('unstars a view that was starred', async () => {
      const id = await queue('Livres')
      await app.inject({
        method: 'POST',
        url: `/api/queues/${id}/favorite`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      await app.inject({
        method: 'DELETE',
        url: `/api/queues/${id}/favorite`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect((await read(id, sessionCookie)).favorite).toBe(false)
    })

    it('lists what the viewer did not star when asked for the opposite', async () => {
      const starred = await queue('Favorita')
      await queue('Outra')
      await app.inject({
        method: 'POST',
        url: `/api/queues/${starred}/favorite`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/queues?favorite=false',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.json().data.map((view: { name: string }) => view.name)).toEqual(['Outra'])
    })

    it('returns 404 when starring a view that does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/queues/${NONEXISTENT_ID}/favorite`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
    })

    it('lists only the views the viewer starred', async () => {
      const starred = await queue('Favorita')
      await queue('Outra')
      await app.inject({
        method: 'POST',
        url: `/api/queues/${starred}/favorite`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const mine = await app.inject({
        method: 'GET',
        url: '/api/queues?favorite=true',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const theirs = await app.inject({
        method: 'GET',
        url: '/api/queues?favorite=true',
        cookies: { [SESSION_COOKIE_NAME]: other },
      })

      expect(mine.json().data.map((queue: { name: string }) => queue.name)).toEqual(['Favorita'])
      expect(mine.json().total).toBe(1)
      expect(theirs.json().data).toEqual([])
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

    it('opens the CRUD routes for the ticket policy, which is what an analyst holds', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/queues',
        cookies: { [SESSION_COOKIE_NAME]: ticketSessionCookie },
      })

      expect(response.statusCode).toBe(200)
    })
  })
})
