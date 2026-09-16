import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { CLOSED_STATUSES } from './schemas.js'

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
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
    })
    sessionCookie = cookieValue(loginResponse, SESSION_COOKIE_NAME)!
  })

  afterAll(async () => {
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  afterEach(async () => {
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

      it('uma palavra já canônica passa reta, ignorando o alterationType', async () => {
        const response = await post({ enrollmentType: 'exclusion', alterationType: 'plan' })

        expect(response.statusCode).toBe(201)
        expect(response.json().enrollmentType).toBe('exclusion')
      })

      it.each([
        ['sem pista nenhuma', { name: 'Test User' }],
        ['com uma palavra que o EI não emite no snapshot', { alteration_type: 'cnpj' }],
      ])(
        'responde 422 nomeando o alterationType para uma alteration %s',
        async (_case, enrollmentSnapshot) => {
          const response = await post({ enrollmentType: 'alteration', enrollmentSnapshot })

          expect(response.statusCode).toBe(422)
          expect(response.json().error).toBe('ValidationFailedError')
          expect(response.json().details[0].field).toBe('alterationType')
        },
      )

      /** The point of the enum: a word the EI adds tomorrow fails loudly here
       *  instead of reaching a row raw. */
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
      expect(ticket.groupId).toBeNull()
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

    /** A blank column is worse than a null one: the screen would show a value
     *  that does not exist, and the filter an option nobody picks. */
    it.each(['carrierId', 'carrierName', 'product', 'contractType', 'companySize'])(
      'recusa %s em branco em vez de gravar coluna vazia',
      async (field) => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/tickets',
          payload: { ...validTicketBody, [field]: '' },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })

        expect(response.statusCode).toBe(400)
      },
    )

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
