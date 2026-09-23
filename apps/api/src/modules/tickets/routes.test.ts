import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { businessToday } from '../../shared/business-date.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { sessionWithoutSub } from '../auth/session.test-helpers.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
import { CLOSED_STATUSES } from './schemas.js'

function cookieValue(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string | null {
  return response.cookies.find((cookie) => cookie.name === name)?.value ?? null
}

const DEV_LOGIN_USER_ID = 'dev@piposaude.com.br'
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000099'
const TICKET_POLICIES = ['admin/allow/administrate/pipodesk/ticket']

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
  let rootGroupId: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: TICKET_POLICIES },
    })
    sessionCookie = cookieValue(loginResponse, SESSION_COOKIE_NAME)!
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('tickets').execute()
    await app.db.deleteFrom('ticket_queues').execute()
  })

  const createQueue = async (name: string): Promise<string> => {
    const row = await app.db
      .insertInto('ticket_queues')
      .values({ name, created_by: 'test' })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

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

    it('stores the subject the caller sends, untouched', async () => {
      const title = 'Bradesco | ACME LTDA | 🩺 Saúde | Inclusão de titular - MARIA SILVA'

      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, title },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().title).toBe(title)

      const read = await app.inject({
        method: 'GET',
        url: `/api/tickets/${response.json().id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(read.json().title).toBe(title)
    })

    it('rejects a blank title', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, title: '' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('stores the HR requester and the people in copy', async () => {
      const requester = {
        email: 'rh@acme.com.br',
        name: 'Sergio Gouveia',
        phone: '11999998888',
        preferredChannel: 'platform',
      }
      const collaborators = [{ email: 'financeiro@acme.com.br' }, { email: 'dp@acme.com.br' }]

      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, requester, collaborators },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)

      const read = await app.inject({
        method: 'GET',
        url: `/api/tickets/${response.json().id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(read.json().requester).toEqual(requester)
      expect(read.json().collaborators).toEqual(collaborators)
    })

    it('leaves the requester null and the copy list empty when the caller omits them', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.json().requester).toBeNull()
      expect(response.json().collaborators).toEqual([])
    })

    it('refuses a copy list longer than the cap', async () => {
      const collaborators = Array.from({ length: 51 }, (_, i) => ({ email: `dp${i}@acme.com.br` }))

      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, collaborators },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it.each([
      ['no e-mail', { name: 'Sergio Gouveia' }],
      ['an e-mail that is not one', { email: 'sergio' }],
      ['a field nobody reads', { email: 'rh@acme.com.br', cargo: 'RH' }],
    ])('refuses a requester with %s', async (_label, requester) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, requester },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('stores the date the movement is scheduled for', async () => {
      const actionDate = '2026-10-01T03:00:00.000Z'

      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, actionDate },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().actionDate).toBe(actionDate)
    })

    it('refuses a scheduled date without a timezone, which would move the day', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, actionDate: '2026-10-01' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('stores how the movement came in', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, origin: 'automation-failure' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().origin).toBe('automation-failure')
    })

    it('leaves the origin null when the caller does not say how it came in', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.json().origin).toBeNull()
    })

    it('accepts the pod the caller routed the ticket to', async () => {
      const group = await app.db
        .insertInto('ticket_groups')
        .values({ name: 'POD 3', created_by: DEV_LOGIN_USER_ID })
        .returning('id')
        .executeTakeFirstOrThrow()

      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, groupId: group.id },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().groupId).toBe(group.id)

      // The ticket first: it points at the group. Both by id, because the
      // database is shared with whatever else is running.
      await app.db.deleteFrom('tickets').where('id', '=', response.json().id).execute()
      await app.db.deleteFrom('ticket_groups').where('id', '=', group.id).execute()
    })

    describe('o pod em que o chamado nasce', () => {
      const createPod = async (name: string): Promise<string> => {
        const row = await app.db
          .insertInto('ticket_groups')
          .values({ name, parent_id: rootGroupId, created_by: DEV_LOGIN_USER_ID })
          .returning('id')
          .executeTakeFirstOrThrow()
        return row.id
      }

      const portfolio = async (groupId: string, companyId: string): Promise<void> => {
        await app.db
          .insertInto('ticket_group_companies')
          .values({ group_id: groupId, company_id: companyId })
          .execute()
      }

      const pods: string[] = []

      afterEach(async () => {
        await app.db.deleteFrom('tickets').execute()
        if (pods.length === 0) return
        await app.db.deleteFrom('ticket_group_companies').where('group_id', 'in', pods).execute()
        await app.db.deleteFrom('ticket_groups').where('id', 'in', pods).execute()
        pods.length = 0
      })

      it('is the pod whose portfolio carries the company', async () => {
        const pod = await createPod('POD 1')
        pods.push(pod)
        await portfolio(pod, validTicketBody.companyId)

        const response = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          payload: validTicketBody,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })

        expect(response.statusCode).toBe(201)
        expect(response.json().groupId).toBe(pod)
      })

      it('is the root group when no portfolio carries the company', async () => {
        const pod = await createPod('POD 1')
        pods.push(pod)
        await portfolio(pod, '00000000-0000-4000-8000-000000000077')

        const response = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          payload: validTicketBody,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })

        expect(response.statusCode).toBe(201)
        expect(response.json().groupId).toBe(rootGroupId)
      })

      it('is the one the caller sent, over the portfolio', async () => {
        const carrier = await createPod('POD 1')
        const chosen = await createPod('POD 2')
        pods.push(carrier, chosen)
        await portfolio(carrier, validTicketBody.companyId)

        const response = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          payload: { ...validTicketBody, groupId: chosen },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })

        expect(response.statusCode).toBe(201)
        expect(response.json().groupId).toBe(chosen)
      })

      it('answers 503 and writes nothing when there is no root group to fall back to', async () => {
        await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
        try {
          const response = await app.inject({
            method: 'POST',
            url: '/api/tickets',
            payload: validTicketBody,
            cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
          })

          expect(response.statusCode).toBe(503)
          expect(response.json().error).toBe('ServiceUnavailableError')
          const written = await app.db.selectFrom('tickets').select('id').execute()
          expect(written).toEqual([])
        } finally {
          rootGroupId = await createRootGroup(app.db)
        }
      })
    })

    it.each(['groupId', 'parentTicketId', 'queueId'])(
      'names %s when it points at nothing',
      async (field) => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          payload: { ...validTicketBody, [field]: NONEXISTENT_ID },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })

        expect(response.statusCode).toBe(422)
        expect(response.json().error).toBe('ValidationFailedError')
        expect(response.json().details[0].field).toBe(field)
      },
    )

    it('ignores a status in the body: the ticket is born in the first state', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, status: 'completed' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().status).toBe('broker-processing')
      expect(response.json().closedAt).toBeNull()
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

    it('says which ticket is already open, so the caller does not have to ask', async () => {
      const first = await app.inject({
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
      expect(response.json().ticketId).toBe(first.json().id)
    })

    // Cases from the vocabulary; the partial index must list the same statuses.
    it.each([...CLOSED_STATUSES])(
      'frees the enrollment for a new ticket once the old one is %s',
      async (closingStatus) => {
        const created = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          payload: validTicketBody,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        const { id } = created.json()

        await app.inject({
          method: 'PATCH',
          url: `/api/tickets/${id}/status`,
          payload: { status: closingStatus },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })

        const response = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          payload: validTicketBody,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })

        expect(response.statusCode).toBe(201)
      },
    )

    describe('o tipo da movimentação, traduzido na entrada', () => {
      const post = (overrides: Record<string, unknown>) =>
        app.inject({
          method: 'POST',
          url: '/api/tickets',
          payload: { ...validTicketBody, ...overrides },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })

      it.each([
        ['plan', 'plan_change'],
        ['registration', 'registration_data_change'],
        ['registration-data', 'registration_data_change'],
        ['combined', 'combined_change'],
      ])('grava alteration + %s como %s', async (alterationType, expected) => {
        const response = await post({ enrollmentType: 'alteration', alterationType })

        expect(response.statusCode).toBe(201)
        expect(response.json().enrollmentType).toBe(expected)
      })

      it('lê o alteration_type do snapshot quando o corpo não o traz', async () => {
        const response = await post({
          enrollmentType: 'alteration',
          enrollmentSnapshot: { request_type: 'alteration', alteration_type: 'plan' },
        })

        expect(response.statusCode).toBe(201)
        expect(response.json().enrollmentType).toBe('plan_change')
      })

      it('o corpo vence o snapshot', async () => {
        const response = await post({
          enrollmentType: 'alteration',
          alterationType: 'combined',
          enrollmentSnapshot: { alteration_type: 'plan' },
        })

        expect(response.json().enrollmentType).toBe('combined_change')
      })

      it('aceita o tipo em qualquer caixa, vindo do corpo', async () => {
        const response = await post({ enrollmentType: 'Alteration', alterationType: 'Plan' })

        expect(response.statusCode).toBe(201)
        expect(response.json().enrollmentType).toBe('plan_change')
      })

      it('aceita o alteration_type em qualquer caixa, vindo do snapshot', async () => {
        const response = await post({
          enrollmentType: 'alteration',
          enrollmentSnapshot: { alteration_type: 'COMBINED' },
        })

        expect(response.statusCode).toBe(201)
        expect(response.json().enrollmentType).toBe('combined_change')
      })

      it('uma palavra já canônica passa reta, ignorando o alterationType', async () => {
        const response = await post({ enrollmentType: 'exclusion', alterationType: 'plan' })

        expect(response.statusCode).toBe(201)
        expect(response.json().enrollmentType).toBe('exclusion')
      })

      it.each([
        ['sem pista nenhuma', { name: 'Test User' }, 'required'],
        ['com uma palavra que o EI não emite no snapshot', { alteration_type: 'cnpj' }, 'invalid'],
        ['com um alteration_type que nem palavra é', { alteration_type: 42 }, 'invalid'],
      ])('responde 422 %s, nomeando o alterationType', async (_case, enrollmentSnapshot, code) => {
        const response = await post({ enrollmentType: 'alteration', enrollmentSnapshot })

        expect(response.statusCode).toBe(422)
        expect(response.json().error).toBe('ValidationFailedError')
        expect(response.json().details[0]).toMatchObject({ field: 'alterationType', code })
      })

      it.each([
        ['enrollmentType', 'cancellation'],
        ['alterationType', 'cnpj'],
      ])('responde 400 para %s fora do vocabulário', async (field, word) => {
        const response = await post({ enrollmentType: 'alteration', [field]: word })

        expect(response.statusCode).toBe(400)
      })

      it('o filtro Tipo acha o chamado que o EI abriu como alteration', async () => {
        await post({ enrollmentType: 'alteration', alterationType: 'plan' })

        const list = await app.inject({
          method: 'GET',
          url: '/api/tickets?enrollmentType=plan_change',
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(list.json().total).toBe(1)

        const rows = await app.inject({
          method: 'GET',
          url: '/api/tickets/rows?types=plan_change',
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(rows.json().total).toBe(1)
        expect(rows.json().data[0].enrollmentType).toBe('plan_change')
      })
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

    it('returns the queue/detail fields with their defaults', async () => {
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
      const [ticket] = response.json().data
      expect(ticket.displayNumber).toMatch(/^M\d{6,}$/)
      expect(ticket.title).toBeNull()
      expect(ticket.priority).toBeNull()
      expect(ticket.actionDate).toBeNull()
      expect(ticket.groupId).toBe(rootGroupId)
      expect(ticket.pendingDocumentation).toEqual([])
      expect(ticket.requester).toBeNull()
      expect(ticket.collaborators).toEqual([])
    })

    it('assigns a distinct displayNumber to each ticket', async () => {
      for (const enrollmentId of [
        '00000000-0000-4000-8000-000000000011',
        '00000000-0000-4000-8000-000000000012',
      ]) {
        await app.inject({
          method: 'POST',
          url: '/api/tickets',
          payload: { ...validTicketBody, enrollmentId },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const numbers = response.json().data.map((t: { displayNumber: string }) => t.displayNumber)
      expect(numbers).toHaveLength(2)
      expect(new Set(numbers).size).toBe(2)
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
      const queueId = await createQueue('Exclusões vencidas')
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
        payload: { ...validTicketBody, tags: ['urgent'] },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          enrollmentId: '00000000-0000-4000-8000-000000000002',
          tags: ['dental'],
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const singleTag = await app.inject({
        method: 'GET',
        url: '/api/tickets?tags=urgent',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(singleTag.json().total).toBe(1)

      const orSemantics = await app.inject({
        method: 'GET',
        url: '/api/tickets?tags=urgent&tags=dental',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(orSemantics.json().total).toBe(2)

      const miss = await app.inject({
        method: 'GET',
        url: '/api/tickets?tags=health',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(miss.json().total).toBe(0)
    })

    it('searches by member name in enrollment snapshot', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          enrollmentSnapshot: { membros: [{ name: 'Maria Oliveira', tax_id: '123.456.789-00' }] },
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const hitByName = await app.inject({
        method: 'GET',
        url: '/api/tickets?search=Maria',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(hitByName.json().total).toBe(1)

      const hitByTaxId = await app.inject({
        method: 'GET',
        url: '/api/tickets?search=123.456',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(hitByTaxId.json().total).toBe(1)

      const miss = await app.inject({
        method: 'GET',
        url: '/api/tickets?search=João',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(miss.json().total).toBe(0)
    })

    it('paginates results correctly with stable ordering', async () => {
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

      const page1Again = await app.inject({
        method: 'GET',
        url: '/api/tickets?page=1&pageSize=1',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const page2Again = await app.inject({
        method: 'GET',
        url: '/api/tickets?page=2&pageSize=1',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(page1Again.json().data[0].id).toBe(id1)
      expect(page2Again.json().data[0].id).toBe(id2)
    })

    it('returns correct total even when page is out of range', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/tickets?page=99&pageSize=20',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data).toHaveLength(0)
      expect(response.json().total).toBe(1)
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
        payload: { tags: ['pj_mov'] },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('UnauthorizedError')
    })

    it('returns 404 for a non-existent ticket', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tickets/00000000-0000-4000-8000-000000000099',
        payload: { tags: ['pj_mov'] },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NotFoundError')
    })

    it('updates a field and returns 200', async () => {
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
        payload: { tags: ['pj_mov'] },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().tags).toEqual(['pj_mov'])
    })

    it('changes the priority of a ticket', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${created.json().id}`,
        payload: { priority: 'urgent' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().priority).toBe('urgent')
    })

    it('refuses a priority outside the four the queue knows', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${created.json().id}`,
        payload: { priority: 'invalid' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('records who changed the priority, and what it was before', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      for (const priority of ['urgent', 'low']) {
        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/tickets/${id}`,
          payload: { priority },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(patch.statusCode).toBe(200)
      }

      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const events = timeline.json().data.filter((item: { type: string }) => item.type === 'event')

      expect(events).toHaveLength(2)
      expect(events[1]).toMatchObject({
        eventType: 'priority_changed',
        authorId: 'dev@piposaude.com.br',
        metadata: { priority: 'low', previous: 'urgent' },
      })
    })

    it('says nothing when the priority sent is the one already there', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      for (let attempt = 0; attempt < 2; attempt++) {
        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/tickets/${id}`,
          payload: { priority: 'high' },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(patch.json()).toMatchObject({ priority: 'high' })
      }

      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const events = timeline.json().data.filter((item: { type: string }) => item.type === 'event')

      expect(events).toHaveLength(1)
    })

    it('records the removal of a priority as a removal', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      for (const priority of ['urgent', null]) {
        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/tickets/${id}`,
          payload: { priority },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(patch.json()).toMatchObject({ priority })
      }

      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const events = timeline.json().data.filter((item: { type: string }) => item.type === 'event')

      expect(events[1]).toMatchObject({
        body: 'Prioridade removida',
        metadata: { priority: null, previous: 'urgent' },
      })
    })

    it('still takes a PATCH that names no priority from a session with no sub', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${created.json().id}`,
        payload: { tags: ['pj_mov'] },
        cookies: { [SESSION_COOKIE_NAME]: sessionWithoutSub(app, TICKET_POLICIES) },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().tags).toEqual(['pj_mov'])
    })

    it('refuses to change the priority from a session with no sub to sign it', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${created.json().id}`,
        payload: { priority: 'urgent' },
        cookies: { [SESSION_COOKIE_NAME]: sessionWithoutSub(app, TICKET_POLICIES) },
      })

      expect(response.statusCode).toBe(401)
    })

    it('leaves neither the priority nor the event behind when another field fails', async () => {
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
        payload: { priority: 'urgent', queueId: NONEXISTENT_ID },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)

      const ticket = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(ticket.json().priority).toBeNull()
      expect(
        timeline.json().data.filter((item: { type: string }) => item.type === 'event'),
      ).toHaveLength(0)
    })

    it('reschedules a ticket, and unschedules it with null', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, actionDate: '2026-10-01T03:00:00.000Z' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      for (const actionDate of ['2026-10-08T03:00:00.000Z', null]) {
        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/tickets/${id}`,
          payload: { actionDate },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(patch.statusCode).toBe(200)
        expect(patch.json().actionDate).toBe(actionDate)
      }
    })

    it('records who rescheduled the ticket, and the date it had before', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, actionDate: '2026-10-01T03:00:00.000Z' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}`,
        payload: { actionDate: '2026-10-08T03:00:00.000Z' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(patch.statusCode).toBe(200)

      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const events = timeline.json().data.filter((item: { type: string }) => item.type === 'event')

      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        eventType: 'action_date_changed',
        authorId: 'dev@piposaude.com.br',
        body: 'Data de ação alterada',
        metadata: { actionDate: '2026-10-08T03:00:00.000Z', previous: '2026-10-01T03:00:00.000Z' },
      })
    })

    it('tells scheduling, rescheduling and unscheduling apart', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      for (const actionDate of ['2026-10-01T03:00:00.000Z', '2026-10-08T03:00:00.000Z', null]) {
        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/tickets/${id}`,
          payload: { actionDate },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(patch.statusCode).toBe(200)
      }

      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const events = timeline.json().data.filter((item: { type: string }) => item.type === 'event')

      expect(events.map((event: { body: string }) => event.body)).toEqual([
        'Data de ação definida',
        'Data de ação alterada',
        'Data de ação removida',
      ])
      expect(events[2].metadata).toEqual({
        actionDate: null,
        previous: '2026-10-08T03:00:00.000Z',
      })
    })

    it('says nothing when the date sent is the same instant in another offset', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, actionDate: '2026-10-01T03:00:00.000Z' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}`,
        payload: { actionDate: '2026-10-01T00:00:00-03:00' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(patch.statusCode).toBe(200)
      expect(patch.json().actionDate).toBe('2026-10-01T03:00:00.000Z')

      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(
        timeline.json().data.filter((item: { type: string }) => item.type === 'event'),
      ).toHaveLength(0)
    })

    it('records the priority and the action date changed together as two events', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}`,
        payload: { priority: 'urgent', actionDate: '2026-10-01T03:00:00.000Z' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(patch.statusCode).toBe(200)

      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const types = timeline
        .json()
        .data.filter((item: { type: string }) => item.type === 'event')
        .map((event: { eventType: string }) => event.eventType)

      expect(types.sort()).toEqual(['action_date_changed', 'priority_changed'])
    })

    it('refuses to reschedule from a session with no sub to sign it', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${created.json().id}`,
        payload: { actionDate: '2026-10-01T03:00:00.000Z' },
        cookies: { [SESSION_COOKIE_NAME]: sessionWithoutSub(app, TICKET_POLICIES) },
      })

      expect(response.statusCode).toBe(401)
    })

    it('leaves neither the date nor the event behind when another field fails', async () => {
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
        payload: { actionDate: '2026-10-01T03:00:00.000Z', queueId: NONEXISTENT_ID },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)

      const ticket = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(ticket.json().actionDate).toBeNull()
      expect(
        timeline.json().data.filter((item: { type: string }) => item.type === 'event'),
      ).toHaveLength(0)
    })

    it('takes a ticket scheduled past the window out of the queue, and brings it back', async () => {
      const inDays = (days: number): string =>
        new Date(Date.parse(`${businessToday()}T15:00:00.000Z`) + days * 86_400_000).toISOString()
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, title: 'agendado' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()
      const reschedule = async (actionDate: string) => {
        const patch = await app.inject({
          method: 'PATCH',
          url: `/api/tickets/${id}`,
          payload: { actionDate },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(patch.statusCode).toBe(200)
      }
      const idsIn = async (window: string): Promise<string[]> => {
        const rows = await app.inject({
          method: 'GET',
          url: `/api/tickets/rows?window=${window}`,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        return rows.json().data.map((row: { id: string }) => row.id)
      }

      await reschedule(inDays(10))
      expect(await idsIn('awake')).not.toContain(id)
      expect(await idsIn('sleeping')).toContain(id)

      await reschedule(inDays(-1))
      expect(await idsIn('awake')).toContain(id)
      expect(await idsIn('sleeping')).not.toContain(id)
    })

    it('refuses a new action date without a timezone, naming the field', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${created.json().id}`,
        payload: { actionDate: '2026-10-01' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().details[0].field).toBe('actionDate')
    })

    it('accepts null to clear a nullable field', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, queueId: await createQueue('Exclusões vencidas') },
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

    it.each(['queueId', 'parentTicketId'])('names %s when it points at nothing', async (field) => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${created.json().id}`,
        payload: { [field]: NONEXISTENT_ID },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)
      expect(response.json().error).toBe('ValidationFailedError')
      expect(response.json().details[0].field).toBe(field)
    })

    /* The saved view selects tickets, it does not hold them: deleting it lets
       the ticket go on without a view, instead of blocking the delete. */
    it('clears the queue of a ticket whose queue is deleted', async () => {
      const queueId = await createQueue('Exclusões vencidas')
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, queueId },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      await app.db.deleteFrom('ticket_queues').where('id', '=', queueId).execute()

      const response = await app.inject({
        method: 'GET',
        url: `/api/tickets/${created.json().id}`,
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

    describe('o responsável', () => {
      const ANA = 'ana@pipo.health'
      const BRUNO = 'bruno@pipo.health'

      const createTicket = async (assigneeId?: string): Promise<string> => {
        const created = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          payload: { ...validTicketBody, ...(assigneeId && { assigneeId }) },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        return created.json().id
      }

      const assign = (id: string, assigneeId: string | null, cookie = sessionCookie) =>
        app.inject({
          method: 'PATCH',
          url: `/api/tickets/${id}`,
          payload: { assigneeId },
          cookies: { [SESSION_COOKIE_NAME]: cookie },
        })

      const eventsOf = async (id: string) => {
        const timeline = await app.inject({
          method: 'GET',
          url: `/api/tickets/${id}/timeline`,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        return timeline.json().data.filter((item: { type: string }) => item.type === 'event')
      }

      it('records who assigned the ticket, and to whom it was before', async () => {
        const id = await createTicket(ANA)

        expect((await assign(id, BRUNO)).json()).toMatchObject({ assigneeId: BRUNO })

        expect(await eventsOf(id)).toEqual([
          expect.objectContaining({
            eventType: 'assigned',
            body: 'Responsável alterado',
            authorId: DEV_LOGIN_USER_ID,
            metadata: { assigneeId: BRUNO, previous: ANA },
          }),
        ])
      })

      it('tells a first assignment and a removal apart from a change', async () => {
        const id = await createTicket()

        await assign(id, ANA)
        await assign(id, null)

        const events = await eventsOf(id)
        expect(events.map((event: { body: string }) => event.body)).toEqual([
          'Responsável definido',
          'Responsável removido',
        ])
        expect(events[1].metadata).toEqual({ assigneeId: null, previous: ANA })
      })

      it('says nothing when the assignee sent is the one already there', async () => {
        const id = await createTicket(ANA)

        expect((await assign(id, ANA)).statusCode).toBe(200)

        expect(await eventsOf(id)).toEqual([])
      })

      it('refuses to change the assignee from a session with no sub to sign it', async () => {
        const id = await createTicket(ANA)

        const response = await assign(id, BRUNO, sessionWithoutSub(app, TICKET_POLICIES))

        expect(response.statusCode).toBe(401)
        const ticket = await app.inject({
          method: 'GET',
          url: `/api/tickets/${id}`,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(ticket.json().assigneeId).toBe(ANA)
      })
    })
  })

  // ---------------------------------------------------------------------------
  describe('PATCH /api/tickets/:id/status', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${NONEXISTENT_ID}/status`,
        payload: { status: 'carrier-processing' },
      })
      expect(response.statusCode).toBe(401)
    })

    it('returns 404 for nonexistent ticket', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${NONEXISTENT_ID}/status`,
        payload: { status: 'carrier-processing' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(404)
      expect(response.json().error).toBe('NotFoundError')
    })

    it('changes the ticket status and records history', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: validTicketBody,
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}/status`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { status: 'carrier-processing' },
      })
      const body = response.json()

      expect(response.statusCode).toBe(200)
      expect(body.id).toBe(id)
      expect(body.status).toBe('carrier-processing')

      const history = await app.db
        .selectFrom('ticket_status_history')
        .selectAll()
        .where('ticket_id', '=', id)
        .executeTakeFirst()

      expect(history).toBeDefined()
      expect(history!.from_status).toBe('broker-processing')
      expect(history!.to_status).toBe('carrier-processing')
      expect(history!.author_id).toBe(DEV_LOGIN_USER_ID)
      expect(history!.author_type).toBe('user')
      expect(history!.reason).toBeNull()
    })

    it('records optional reason in history', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: validTicketBody,
      })
      const { id } = created.json()

      await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}/status`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { status: 'missing-documents', reason: 'RG não enviado' },
      })

      const history = await app.db
        .selectFrom('ticket_status_history')
        .selectAll()
        .where('ticket_id', '=', id)
        .executeTakeFirst()

      expect(history!.reason).toBe('RG não enviado')
    })

    it('sets closedAt when moving to completed', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: validTicketBody,
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}/status`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { status: 'completed' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().status).toBe('completed')
      expect(response.json().closedAt).not.toBeNull()
    })

    it.each([...CLOSED_STATUSES])(
      'returns 422 when ticket is already %s',
      async (closingStatus) => {
        const created = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
          payload: validTicketBody,
        })
        const { id } = created.json()

        await app.inject({
          method: 'PATCH',
          url: `/api/tickets/${id}/status`,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
          payload: { status: closingStatus },
        })

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/tickets/${id}/status`,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
          payload: { status: 'carrier-processing' },
        })

        expect(response.statusCode).toBe(422)
        expect(response.json().error).toBe('UnprocessableEntityError')
      },
    )
  })

  // ---------------------------------------------------------------------------
  describe('POST /api/tickets/:id/claim', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${NONEXISTENT_ID}/claim`,
      })
      expect(response.statusCode).toBe(401)
    })

    it('returns 404 for nonexistent ticket', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${NONEXISTENT_ID}/claim`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(404)
    })

    it('claims the ticket and sets assigneeId to session user', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: validTicketBody,
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${id}/claim`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const body = response.json()

      expect(response.statusCode).toBe(200)
      expect(body.id).toBe(id)
      expect(body.assigneeId).toBe(DEV_LOGIN_USER_ID)
    })

    it('overwrites previous assignee on re-claim', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { ...validTicketBody, assigneeId: '00000000-0000-4000-8000-000000000050' },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${id}/claim`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().assigneeId).toBe(DEV_LOGIN_USER_ID)
    })

    it('records that the claimer took the ticket, and from whom', async () => {
      const previous = 'ana@pipo.health'
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { ...validTicketBody, assigneeId: previous },
      })
      const { id } = created.json()

      await app.inject({
        method: 'POST',
        url: `/api/tickets/${id}/claim`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const events = timeline.json().data.filter((item: { type: string }) => item.type === 'event')

      expect(events).toEqual([
        expect.objectContaining({
          eventType: 'assigned',
          body: 'Responsável alterado',
          authorId: DEV_LOGIN_USER_ID,
          metadata: { assigneeId: DEV_LOGIN_USER_ID, previous },
        }),
      ])
    })

    it('says nothing when the claimer already holds the ticket', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: validTicketBody,
      })
      const { id } = created.json()

      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/tickets/${id}/claim`,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
        expect(response.statusCode).toBe(200)
      }

      const timeline = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}/timeline`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const events = timeline.json().data.filter((item: { type: string }) => item.type === 'event')

      expect(events.map((event: { body: string }) => event.body)).toEqual(['Responsável definido'])
    })

    it('returns 422 when ticket is already closed', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: validTicketBody,
      })
      const { id } = created.json()

      await app.inject({
        method: 'PATCH',
        url: `/api/tickets/${id}/status`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: { status: 'completed' },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${id}/claim`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)
      expect(response.json().error).toBe('UnprocessableEntityError')
    })
  })

  describe('os campos da movimentação', () => {
    it('guarda o que o EI manda e traduz só na resposta', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          carrierId: 'carrier-unimed',
          carrierName: 'Unimed Mineira',
          product: 'health-insurance',
          contractType: 'services-contract',
          companySize: 'corporate',
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const ticket = created.json()

      expect(created.statusCode).toBe(201)
      expect(ticket).toMatchObject({
        carrierId: 'carrier-unimed',
        carrierName: 'Unimed Mineira',
        product: 'health',
        contractType: 'pj',
        companySize: 'enterprise',
      })

      const stored = await app.db
        .selectFrom('tickets')
        .select(['product', 'contract_type', 'company_size'])
        .where('id', '=', ticket.id)
        .executeTakeFirstOrThrow()

      expect(stored).toEqual({
        product: 'health-insurance',
        contract_type: 'services-contract',
        company_size: 'corporate',
      })
    })

    it('deriva o vínculo do snapshot em vez de recebê-lo', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          enrollmentSnapshot: { member_type: 'primary', dependents: [{ id: 'd1' }] },
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.json().relationship).toBe('family-group')
    })

    it('devolve null em vez de quebrar quando a coluna tem valor fora do enum', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()
      await app.db
        .updateTable('tickets')
        .set({ relationship: 'agregado' })
        .where('id', '=', id)
        .execute()

      const read = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(read.statusCode).toBe(200)
      expect(read.json().relationship).toBeNull()
    })

    it('tira os campos do snapshot enquanto o EI não os manda no corpo', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          enrollmentSnapshot: {
            'carrier-id': 'carrier-unimed',
            'carrier-name': 'Unimed Mineira',
            contract: { 'product-type': 'health-insurance' },
            primary: { employment: { 'contract-type': 'services-contract' } },
            company: { 'company-size': 'corporate' },
          },
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const ticket = created.json()

      expect(ticket).toMatchObject({
        carrierId: 'carrier-unimed',
        carrierName: 'Unimed Mineira',
        product: 'health',
        contractType: 'pj',
        companySize: 'enterprise',
      })

      // Derived or sent, the column holds the EI's word.
      const stored = await app.db
        .selectFrom('tickets')
        .select(['product', 'contract_type', 'company_size'])
        .where('id', '=', ticket.id)
        .executeTakeFirstOrThrow()

      expect(stored).toEqual({
        product: 'health-insurance',
        contract_type: 'services-contract',
        company_size: 'corporate',
      })
    })

    it('grava a matriz e o CNPJ que o snapshot traz, quando a empresa é filial', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          enrollmentSnapshot: {
            company: {
              'company-tax-id': '11.111.111/0001-11',
              'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
              'parent-company-name': 'Meridiano Holding',
              'parent-company-tax-id': '22.222.222/0001-22',
              'company-subsidiary': true,
            },
          },
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(created.json()).toMatchObject({
        parentCompanyId: '00000000-0000-4000-8000-0000000000a1',
        parentCompanyName: 'Meridiano Holding',
        companyTaxId: '11.111.111/0001-11',
      })

      const stored = await app.db
        .selectFrom('tickets')
        .select(['parent_company_id', 'parent_company_name', 'company_tax_id'])
        .where('id', '=', created.json().id)
        .executeTakeFirstOrThrow()

      expect(stored).toEqual({
        parent_company_id: '00000000-0000-4000-8000-0000000000a1',
        parent_company_name: 'Meridiano Holding',
        company_tax_id: '11.111.111/0001-11',
      })
    })

    it('não grava matriz quando o snapshot diz que a empresa não é filial', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          enrollmentSnapshot: {
            company: {
              'company-tax-id': '11.111.111/0001-11',
              'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
              'parent-company-name': 'Meridiano Holding',
              'parent-company-tax-id': '11.111.111/0001-11',
            },
          },
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(created.json()).toMatchObject({
        parentCompanyId: null,
        parentCompanyName: null,
        companyTaxId: '11.111.111/0001-11',
      })
    })

    /** Both sources can name a parent, so both have to be refused. */
    it.each([
      [
        'snapshot',
        {
          enrollmentSnapshot: {
            company: {
              'company-tax-id': '11.111.111/0001-11',
              'parent-company-id': validTicketBody.companyId,
              'parent-company-name': 'Meridiano Logistica',
              'company-subsidiary': true,
            },
          },
        },
      ],
      [
        'corpo',
        {
          parentCompanyId: validTicketBody.companyId,
          parentCompanyName: 'Meridiano Logistica',
        },
      ],
    ])('não grava a empresa como matriz de si mesma, vinda do %s', async (_source, payload) => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, ...payload },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(created.statusCode).toBe(201)
      expect(created.json()).toMatchObject({ parentCompanyId: null, parentCompanyName: null })
    })

    it('não grava nome de matriz que o corpo mandou sem id', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, parentCompanyName: 'Meridiano Holding' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(created.statusCode).toBe(201)
      expect(created.json()).toMatchObject({
        parentCompanyId: null,
        parentCompanyName: null,
      })
    })

    it('não completa a matriz do corpo com o nome que veio do snapshot', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          parentCompanyId: '00000000-0000-4000-8000-0000000000b9',
          enrollmentSnapshot: {
            company: {
              'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
              'parent-company-name': 'Meridiano Holding',
              'company-subsidiary': true,
            },
          },
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(created.json()).toMatchObject({
        parentCompanyId: '00000000-0000-4000-8000-0000000000b9',
        parentCompanyName: null,
      })
    })

    it('cria o chamado mesmo quando a matriz do snapshot tem id ilegível', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          enrollmentSnapshot: {
            company: {
              'company-tax-id': '11.111.111/0001-11',
              'parent-company-id': 'parent-1',
              'parent-company-name': 'Meridiano Holding',
              'company-subsidiary': true,
            },
          },
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(created.statusCode).toBe(201)
      expect(created.json()).toMatchObject({
        parentCompanyId: null,
        parentCompanyName: null,
        companyTaxId: '11.111.111/0001-11',
      })
    })

    it('prefere a empresa do corpo à do snapshot', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          parentCompanyId: '00000000-0000-4000-8000-0000000000b2',
          parentCompanyName: 'Matriz do corpo',
          companyTaxId: '33.333.333/0001-33',
          enrollmentSnapshot: {
            company: {
              'company-tax-id': '11.111.111/0001-11',
              'parent-company-id': '00000000-0000-4000-8000-0000000000a1',
              'parent-company-name': 'Meridiano Holding',
              'company-subsidiary': true,
            },
          },
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(created.json()).toMatchObject({
        parentCompanyId: '00000000-0000-4000-8000-0000000000b2',
        parentCompanyName: 'Matriz do corpo',
        companyTaxId: '33.333.333/0001-33',
      })
    })

    /** A blank column is worse than a null one: the screen would show a value
     *  that does not exist, and the filter an option nobody picks. */
    it.each([
      'carrierId',
      'carrierName',
      'product',
      'contractType',
      'companySize',
      'parentCompanyName',
      'companyTaxId',
    ])('recusa %s em branco em vez de gravar coluna vazia', async (field) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: { ...validTicketBody, [field]: '' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('prefere o corpo ao snapshot quando os dois trazem o campo', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: {
          ...validTicketBody,
          carrierId: 'carrier-do-corpo',
          enrollmentSnapshot: { 'carrier-id': 'carrier-do-snapshot' },
        },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.json().carrierId).toBe('carrier-do-corpo')
    })

    /** `''` only gets into the column by hand. When it does, one row must not
     *  take the whole page down with it — the response says word or null, so a
     *  blank reads as null. */
    it('lê coluna em branco como nula, no detalhe e na listagem', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()
      await app.db
        .updateTable('tickets')
        .set({ carrier_name: '', product: '', company_size: '   ' })
        .where('id', '=', id)
        .execute()

      const read = await app.inject({
        method: 'GET',
        url: `/api/tickets/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(read.statusCode).toBe(200)
      expect(read.json()).toMatchObject({ carrierName: null, product: null, companySize: null })

      const list = await app.inject({
        method: 'GET',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(list.statusCode).toBe(200)
      expect(list.json().data).toHaveLength(1)
    })

    it('deixa os campos nulos quando nem o corpo nem o snapshot os trazem', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        payload: validTicketBody,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.json()).toMatchObject({
        carrierId: null,
        carrierName: null,
        product: null,
        contractType: null,
        companySize: null,
        relationship: null,
      })
    })
  })
  describe('the ticket policy', () => {
    let withoutPolicy: string
    let withAnotherDomain: string

    beforeAll(async () => {
      const anonymous = await app.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        payload: { policies: [] },
      })
      withoutPolicy = cookieValue(anonymous, SESSION_COOKIE_NAME)!

      const otherDomain = await app.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        payload: { policies: ['admin/allow/administrate/company/*'] },
      })
      withAnotherDomain = cookieValue(otherDomain, SESSION_COOKIE_NAME)!
    })

    const routes: Array<[string, string]> = [
      ['GET', '/api/tickets'],
      ['GET', '/api/tickets/rows'],
      ['GET', '/api/tickets/:id'],
      ['POST', '/api/tickets'],
      ['PATCH', '/api/tickets/:id'],
      ['PATCH', '/api/tickets/:id/status'],
      ['POST', '/api/tickets/:id/claim'],
    ]

    // The id can be one that does not exist: the policy is a door, not a lookup,
    // and it closes before the ticket is searched for.
    it.each(routes)('answers 403 on %s %s for a session with no policy', async (method, url) => {
      const response = await app.inject({
        method: method as 'GET',
        url: url.replace(':id', NONEXISTENT_ID),
        cookies: { [SESSION_COOKIE_NAME]: withoutPolicy },
        payload: method === 'GET' ? undefined : validTicketBody,
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('ForbiddenError')
    })

    it('answers 403 for a session holding only another domain', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: withAnotherDomain },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
