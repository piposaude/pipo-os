import { randomUUID } from 'node:crypto'
import { startMetricsServer } from '@pipo-os/observability/metrics'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { sessionCookieFor } from '../auth/session.test-helpers.js'
import { createRootGroup } from '../groups/root.test-helpers.js'

const TICKET_POLICIES = ['admin/allow/administrate/pipodesk/ticket']

const ticketBody = {
  enrollmentId: '00000000-0000-4000-8000-000000000001',
  enrollmentType: 'inclusion',
  companyId: '00000000-0000-4000-8000-000000000002',
  sourceSystem: 'enrollment-integrations',
  enrollmentSnapshot: { name: 'Test User' },
}

interface Sample {
  name: string
  labels: Record<string, string>
  value: number
}

/** The exposition text parsed line by line: the labels here carry no comma
 *  and no quote, so a split is enough. */
function parseExposition(text: string): Sample[] {
  return text
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const match = /^(\w+)(?:\{(.*)\})? (\S+)$/.exec(line)
      if (!match) throw new Error(`Unparseable exposition line: ${line}`)
      const [, name, rawLabels, value] = match
      const labels = Object.fromEntries(
        (rawLabels ? rawLabels.split(',') : []).map((pair) => {
          const [key, quoted] = pair.split('=')
          return [key, quoted.slice(1, -1)]
        }),
      )
      return { name, labels, value: Number(value) }
    })
}

describe('business metrics', () => {
  let app: FastifyInstance
  let metricsServer: FastifyInstance
  let cookies: Record<string, string>
  let rootGroupId: string

  const scrape = async (): Promise<Sample[]> => {
    const response = await metricsServer.inject({ method: 'GET', url: '/metrics' })
    expect(response.statusCode).toBe(200)
    return parseExposition(response.body)
  }

  const valueOf = async (name: string, labels: Record<string, string>): Promise<number> => {
    const samples = await scrape()
    const sample = samples.find(
      (candidate) =>
        candidate.name === name &&
        Object.entries(labels).every(([key, value]) => candidate.labels[key] === value),
    )
    return sample?.value ?? 0
  }

  const createTicket = async (body: Partial<typeof ticketBody> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/tickets',
      payload: { ...ticketBody, ...body },
      cookies,
    })

  beforeAll(async () => {
    app = buildApp()
    // Port 0: the suite reads it by inject, and 8080 may be taken on the machine.
    metricsServer = await startMetricsServer(app, 0)
    rootGroupId = await createRootGroup(app.db)
    cookies = {
      [SESSION_COOKIE_NAME]: sessionCookieFor(app, 'analista@piposaude.com.br', TICKET_POLICIES),
    }
  })

  beforeEach(() => {
    app.metrics.client.register.resetMetrics()
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('outbound_webhook_deliveries').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
  })

  describe('pipos_tickets_created_total', () => {
    it('counts a created ticket by its source system', async () => {
      expect((await createTicket()).statusCode).toBe(201)
      expect((await createTicket({ enrollmentId: randomUUID() })).statusCode).toBe(201)
      expect(
        (await createTicket({ enrollmentId: randomUUID(), sourceSystem: 'smoke-test' })).statusCode,
      ).toBe(201)

      expect(
        await valueOf('pipos_tickets_created_total', { source_system: 'enrollment-integrations' }),
      ).toBe(2)
      expect(await valueOf('pipos_tickets_created_total', { source_system: 'smoke-test' })).toBe(1)
    })

    it('does not count the 409 of an enrollment that already has an open ticket', async () => {
      expect((await createTicket()).statusCode).toBe(201)
      expect((await createTicket()).statusCode).toBe(409)

      expect(
        await valueOf('pipos_tickets_created_total', { source_system: 'enrollment-integrations' }),
      ).toBe(1)
    })
  })

  describe('pipos_tickets_status_changes_total', () => {
    const changeStatus = async (ticketId: string, status: string) =>
      app.inject({
        method: 'PATCH',
        url: `/api/tickets/${ticketId}/status`,
        payload: { status },
        cookies,
      })

    const submit = async (ticketId: string, submissionId: string, status: string) =>
      app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/submissions`,
        payload: { submissionId, status: { status } },
        cookies,
      })

    const transitions = (from: string, to: string) =>
      valueOf('pipos_tickets_status_changes_total', { from_status: from, to_status: to })

    it('counts a change made by PATCH /status, from and to', async () => {
      const { id } = (await createTicket()).json<{ id: string }>()

      expect((await changeStatus(id, 'carrier-processing')).statusCode).toBe(200)

      expect(await transitions('broker-processing', 'carrier-processing')).toBe(1)
    })

    it('counts a change made by a submission, once even when it is replayed', async () => {
      const { id } = (await createTicket()).json<{ id: string }>()
      const submissionId = randomUUID()

      expect((await submit(id, submissionId, 'missing-documents')).statusCode).toBe(201)
      expect((await submit(id, submissionId, 'missing-documents')).statusCode).toBe(200)

      expect(await transitions('broker-processing', 'missing-documents')).toBe(1)
    })

    it('does not count a change refused on a closed ticket', async () => {
      const { id } = (await createTicket()).json<{ id: string }>()
      expect((await changeStatus(id, 'cancelled')).statusCode).toBe(200)

      expect((await changeStatus(id, 'carrier-processing')).statusCode).toBe(422)
      expect((await submit(id, randomUUID(), 'carrier-processing')).statusCode).toBe(422)

      expect(await transitions('broker-processing', 'cancelled')).toBe(1)
      expect(await transitions('cancelled', 'carrier-processing')).toBe(0)
    })
  })

  describe('pipos_tickets_comments_created_total', () => {
    const comments = (visibility: string, authorType: string) =>
      valueOf('pipos_tickets_comments_created_total', {
        visibility,
        author_type: authorType,
      })

    it('counts a comment by its visibility and the type of its author', async () => {
      const { id } = (await createTicket()).json<{ id: string }>()

      const response = await app.inject({
        method: 'POST',
        url: `/api/tickets/${id}/comments`,
        payload: { visibility: 'public', body: 'Documento recebido' },
        cookies,
      })

      expect(response.statusCode).toBe(201)
      expect(await comments('public', 'user')).toBe(1)
      expect(await comments('private', 'user')).toBe(0)
    })

    it('counts each part of a submission, once even when it is replayed', async () => {
      const { id } = (await createTicket()).json<{ id: string }>()
      const payload = {
        submissionId: randomUUID(),
        parts: [
          { channel: 'internal', body: 'Conferido com a operadora' },
          { channel: 'platform', body: 'Recebemos seu pedido' },
        ],
      }
      const post = () =>
        app.inject({ method: 'POST', url: `/api/tickets/${id}/submissions`, payload, cookies })

      expect((await post()).statusCode).toBe(201)
      expect((await post()).statusCode).toBe(200)

      expect(await comments('private', 'user')).toBe(1)
      expect(await comments('public', 'user')).toBe(1)
    })
  })
})
