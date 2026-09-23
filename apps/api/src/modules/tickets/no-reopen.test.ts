import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { CLOSED_STATUSES, type TicketStatus, updateTicketBodySchema } from './schemas.js'

// DSP-19: a terminal status is terminal. The rule has to hold on every route
// that writes state, not only on the audited one.

const OPEN_STATUS = 'broker-open-issue' satisfies TicketStatus

const validTicketBody = {
  enrollmentId: '00000000-0000-4000-8000-000000000001',
  enrollmentType: 'inclusion',
  companyId: '00000000-0000-4000-8000-000000000002',
  sourceSystem: 'enrollment-integrations',
  enrollmentSnapshot: { name: 'Test User' },
}

describe('a closed ticket does not go back to an open state', () => {
  let app: FastifyInstance
  let rootGroupId: string
  let cookies: Record<string, string>
  let previousDevLoginEnabled: string | undefined
  const createdTicketIds: string[] = []

  beforeAll(async () => {
    previousDevLoginEnabled = process.env.DEV_LOGIN_ENABLED
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
    })
    const sessionCookie = login.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value
    cookies = { [SESSION_COOKIE_NAME]: sessionCookie }
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
    if (previousDevLoginEnabled === undefined) delete process.env.DEV_LOGIN_ENABLED
    else process.env.DEV_LOGIN_ENABLED = previousDevLoginEnabled
  })

  // Scoped to this suite's own tickets: truncating the tables would take other
  // suites' fixtures with it if file parallelism is ever turned on.
  afterEach(async () => {
    if (createdTicketIds.length === 0) return

    const ids = createdTicketIds.splice(0)
    await app.db.deleteFrom('ticket_status_history').where('ticket_id', 'in', ids).execute()
    await app.db.deleteFrom('tickets').where('id', 'in', ids).execute()
  })

  /** A closed OPEN_STATUS would make every assertion below vacuous. */
  it('reopens to a status that is actually open', () => {
    expect(CLOSED_STATUSES.has(OPEN_STATUS)).toBe(false)
  })

  async function createClosedTicket(closingStatus: TicketStatus): Promise<string> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      payload: validTicketBody,
      cookies,
    })
    expect(created.statusCode).toBe(201)
    const { id } = created.json()
    createdTicketIds.push(id)

    const closed = await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${id}/status`,
      payload: { status: closingStatus },
      cookies,
    })
    expect(closed.statusCode).toBe(200)

    return id
  }

  /** The audited door. Guarded since #35; asserted here so the rule reads as one. */
  it.each([...CLOSED_STATUSES])('refuses via PATCH /:id/status when %s', async (closingStatus) => {
    const id = await createClosedTicket(closingStatus)

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${id}/status`,
      payload: { status: OPEN_STATUS },
      cookies,
    })

    expect(response.statusCode).toBe(422)
  })

  /** The unaudited door. Its 400 is the field being gone, not a state check;
   *  the shape case below is what keeps it that way. */
  it.each([...CLOSED_STATUSES])(
    'keeps a %s ticket closed when PATCH /:id carries status',
    async (closingStatus) => {
      const id = await createClosedTicket(closingStatus)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}`,
        payload: { status: OPEN_STATUS },
        cookies,
      })

      expect(response.statusCode).toBe(400)

      const after = await app.inject({ method: 'GET', url: `/api/tickets/${id}`, cookies })
      const ticket = after.json()
      expect(ticket.status).toBe(closingStatus)
      expect(ticket.closedAt).not.toBeNull()
    },
  )

  /** Clearing `closedAt` alone left a closed status with no closing date. */
  it('keeps closedAt when PATCH /:id tries to clear it', async () => {
    const id = await createClosedTicket('completed')

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${id}`,
      payload: { closedAt: null },
      cookies,
    })

    expect(response.statusCode).toBe(400)

    const after = await app.inject({ method: 'GET', url: `/api/tickets/${id}`, cookies })
    expect(after.json().closedAt).not.toBeNull()
  })

  /** Route-level refusals above come from the field being gone, not from a
   *  guard that a later edit could bypass. */
  it.each(['status', 'closedAt'])('has no %s in the update body schema', (field) => {
    expect(Object.keys(updateTicketBodySchema.shape)).not.toContain(field)
  })
})
