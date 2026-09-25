import { createHmac } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { Sentry } from '@pipo-os/observability/sentry-node'
import Fastify, { type FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
import { attempt, claimDue, startDispatcher, type AttemptOptions } from './dispatcher.js'

interface Received {
  headers: Record<string, string | string[] | undefined>
  body: string
}

describe('webhook dispatcher', () => {
  let app: FastifyInstance
  let rootGroupId: string
  let ticketId: string
  let configId: string
  let receiver: FastifyInstance
  let receiverUrl: string
  let received: Received[]
  let releaseHung: () => void

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)

    receiver = Fastify()
    receiver.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) =>
      done(null, body),
    )
    receiver.post('/:answer', async (request, reply) => {
      const { answer } = request.params as { answer: string }
      received.push({ headers: request.headers, body: request.body as string })
      if (answer === 'hang') {
        await new Promise<void>((resolve) => (releaseHung = resolve))
        return reply.status(200).send()
      }
      if (answer === 'redirect') return reply.redirect('/200', 302)
      return reply.status(Number(answer)).send()
    })
    await receiver.listen({ port: 0, host: '127.0.0.1' })
    receiverUrl = `http://127.0.0.1:${(receiver.server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
    await receiver.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  beforeEach(async () => {
    received = []
    releaseHung = () => undefined
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
    })
    const created = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      cookies: {
        [SESSION_COOKIE_NAME]: login.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value,
      },
      payload: {
        enrollmentId: '00000000-0000-4000-8000-000000000001',
        enrollmentType: 'inclusion',
        companyId: '00000000-0000-4000-8000-000000000002',
        sourceSystem: 'enrollment-integrations',
        enrollmentSnapshot: {},
      },
    })
    ticketId = created.json().id
    const config = await app.db
      .insertInto('webhook_configs')
      .values({ name: 'ei', target_url: 'http://127.0.0.1:1/pipodesk-webhook', secret: 's' })
      .returning('id')
      .executeTakeFirstOrThrow()
    configId = config.id
  })

  afterEach(async () => {
    await app.db.deleteFrom('outbound_webhook_deliveries').execute()
    await app.db.deleteFrom('webhook_configs').execute()
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  const seconds = (n: number) => sql<Date>`now() + make_interval(secs => ${n})`

  const seed = async (
    values: {
      status?: string
      dueIn?: number
      lockedAgo?: number
      payload?: object
      answer?: string
      attemptCount?: number
    } = {},
  ): Promise<string> => {
    if (values.answer) {
      await app.db
        .updateTable('webhook_configs')
        .set({ target_url: `${receiverUrl}/${values.answer}` })
        .execute()
    }
    const history = await app.db
      .insertInto('ticket_status_history')
      .values({
        ticket_id: ticketId,
        to_status: 'broker-processing',
        author_type: 'user',
        author_id: 'a@pipo.health',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const row = await app.db
      .insertInto('outbound_webhook_deliveries')
      .values({
        ticket_id: ticketId,
        status_history_id: history.id,
        webhook_config_id: configId,
        target_url: 'http://127.0.0.1:1/pipodesk-webhook',
        payload: JSON.stringify(values.payload ?? { to_status: 'broker-processing' }),
        status: values.status ?? 'pending',
        next_attempt_at: seconds(values.dueIn ?? -1),
        ...(values.lockedAgo !== undefined && { locked_at: seconds(-values.lockedAgo) }),
        ...(values.attemptCount !== undefined && { attempt_count: values.attemptCount }),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  const ids = (claimed: { id: string }[]) => claimed.map((delivery) => delivery.id)

  const row = (id: string) =>
    app.db
      .selectFrom('outbound_webhook_deliveries')
      .selectAll()
      .select(sql<number>`extract(epoch from next_attempt_at - now())`.as('wait'))
      .where('id', '=', id)
      .executeTakeFirstOrThrow()

  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const settles = async (id: string, status: string) => {
    for (let waited = 0; waited < 2000; waited += 20) {
      if ((await row(id)).status === status) return
      await pause(20)
    }
    expect((await row(id)).status).toBe(status)
  }

  describe('claimDue', () => {
    it('reserves only what is due and still pending or failed', async () => {
      const pending = await seed({ status: 'pending' })
      const failed = await seed({ status: 'failed' })
      await seed({ status: 'pending', dueIn: 60 })
      await seed({ status: 'delivered' })
      await seed({ status: 'dead' })

      expect(ids(await claimDue(app.db)).sort()).toEqual([pending, failed].sort())
    })

    it('reserves the oldest first, up to the limit', async () => {
      const newest = await seed({ dueIn: -10 })
      const oldest = await seed({ dueIn: -30 })
      const middle = await seed({ dueIn: -20 })

      expect(ids(await claimDue(app.db, 2)).sort()).toEqual([oldest, middle].sort())
      expect(ids(await claimDue(app.db, 2))).toEqual([newest])
    })

    it('does not reserve again a delivery whose lease still holds', async () => {
      await seed()
      await seed({ lockedAgo: 59 })

      expect(await claimDue(app.db)).toHaveLength(1)
      expect(await claimDue(app.db)).toEqual([])
    })

    it('reserves again a delivery whose lease has expired', async () => {
      const abandoned = await seed({ lockedAgo: 61 })

      expect(ids(await claimDue(app.db))).toEqual([abandoned])
    })

    it('skips what another replica is reserving, without waiting for it', async () => {
      for (let i = 0; i < 30; i++) await seed()

      const [first, second] = await app.db.transaction().execute(async (trx) => {
        const held = await claimDue(trx, 20)
        return [held, await claimDue(app.db, 20)]
      })

      const all = [...ids(first), ...ids(second)]
      expect(second).toHaveLength(10)
      expect(new Set(all).size).toBe(30)
    })

    it('hands over the current address and secret of the destination, and the body to sign', async () => {
      const id = await seed({ payload: { delivery_id: 'd', to_status: 'completed' } })
      await app.db
        .updateTable('webhook_configs')
        .set({ target_url: 'http://ei.default:3000/pipodesk-webhook', secret: 'rotated' })
        .execute()

      const [delivery] = await claimDue(app.db)

      expect(delivery).toMatchObject({
        id,
        ticketId,
        webhookConfigId: configId,
        targetUrl: 'http://ei.default:3000/pipodesk-webhook',
        secret: 'rotated',
        attemptCount: 0,
      })
      expect(JSON.parse(delivery!.body)).toEqual({ delivery_id: 'd', to_status: 'completed' })
      expect((await row(id)).target_url).toBe('http://ei.default:3000/pipodesk-webhook')
    })
  })

  describe('attempt', () => {
    const options = (overrides: Partial<AttemptOptions> = {}): AttemptOptions => ({
      db: app.db,
      log: app.log,
      ...overrides,
    })

    const attemptOne = async (overrides: Partial<AttemptOptions> = {}) => {
      const [delivery] = await claimDue(app.db)
      await attempt(options(overrides), delivery!)
      return delivery!
    }

    it('marks the delivery as delivered on a 2xx', async () => {
      const id = await seed({ answer: '204' })

      await attemptOne()

      expect(await row(id)).toMatchObject({
        status: 'delivered',
        attempt_count: 1,
        response_status: 204,
        last_error: null,
        locked_at: null,
        delivered_at: expect.any(Date),
      })
    })

    it('sends the stored body with a signature the receiver can verify', async () => {
      const id = await seed({
        answer: '200',
        payload: { delivery_id: 'd', reason: 'Não confirmou' },
      })

      await attemptOne()

      const [{ headers, body }] = received as [Received]
      const timestamp = headers['x-pipodesk-webhook-signature-timestamp'] as string
      expect(JSON.parse(body)).toEqual({ delivery_id: 'd', reason: 'Não confirmou' })
      expect(headers['content-type']).toBe('application/json')
      expect(headers['x-pipodesk-delivery']).toBe(id)
      expect(headers['x-pipodesk-webhook-signature']).toBe(
        createHmac('sha256', 's').update(timestamp).update(body).digest('base64'),
      )
    })

    it('signs with the time the attempt is sent', async () => {
      await seed({ answer: '200' })

      await attemptOne({ now: () => new Date('2026-09-25T15:00:00Z') })

      expect(received[0]!.headers['x-pipodesk-webhook-signature-timestamp']).toBe(
        '2026-09-25T15:00:00.000Z',
      )
    })

    it('schedules the next attempt 30 s after the first failure', async () => {
      const id = await seed({ answer: '500' })

      await attemptOne()

      const failed = await row(id)
      expect(failed).toMatchObject({
        status: 'failed',
        attempt_count: 1,
        response_status: 500,
        last_error: null,
        locked_at: null,
      })
      expect(Number(failed.wait)).toBeCloseTo(30, 0)
    })

    it.each([
      [1, 60],
      [6, 1920],
      [7, 3600],
      [8, 3600],
    ])(
      'waits twice as long after each failure, up to an hour (%i before)',
      async (before, wait) => {
        const id = await seed({ answer: '500', attemptCount: before })

        await attemptOne()

        expect(Number((await row(id)).wait)).toBeCloseTo(wait, 0)
      },
    )

    it('retries a 4xx like any other failure', async () => {
      const id = await seed({ answer: '401' })

      await attemptOne()

      expect(await row(id)).toMatchObject({ status: 'failed', response_status: 401 })
    })

    it('records a receiver that does not answer in time as a failure', async () => {
      const id = await seed({ answer: 'hang' })

      await attemptOne({ timeoutMs: 50 })
      releaseHung()

      expect(await row(id)).toMatchObject({
        status: 'failed',
        response_status: null,
        last_error: 'timed out after 50ms',
      })
    })

    it('does not follow a redirect', async () => {
      const id = await seed({ answer: 'redirect' })

      await attemptOne()

      expect(received).toHaveLength(1)
      expect(await row(id)).toMatchObject({
        status: 'failed',
        response_status: null,
        last_error: expect.stringContaining('redirect'),
      })
    })

    it('gives up on the tenth failure and raises it in Sentry', async () => {
      const events: Sentry.Event[] = []
      Sentry.init({
        dsn: 'https://public@sentry.invalid/1',
        defaultIntegrations: false,
        registerEsmLoaderHooks: false,
        beforeSend: (event) => {
          events.push(event)
          return null
        },
      })
      const id = await seed({ answer: '500', attemptCount: 9 })

      try {
        await attemptOne()
        await Sentry.flush(1000)
      } finally {
        await Sentry.close()
      }

      expect(await row(id)).toMatchObject({ status: 'dead', attempt_count: 10 })
      await app.db
        .updateTable('outbound_webhook_deliveries')
        .set({ next_attempt_at: seconds(-1) })
        .execute()
      expect(await claimDue(app.db)).toEqual([])
      expect(events).toMatchObject([
        {
          message: 'webhook delivery dead',
          level: 'error',
          extra: { deliveryId: id, ticketId, webhookConfigId: configId },
        },
      ])
    })
  })

  describe('the rounds', () => {
    const subject = async ({
      enabled = false,
      rounds,
    }: { enabled?: boolean; rounds?: Parameters<typeof startDispatcher>[1] } = {}) => {
      if (enabled) process.env.WEBHOOK_DISPATCHER_ENABLED = 'true'
      try {
        const api = buildApp()
        if (rounds) api.register(async (scope) => startDispatcher(scope, rounds))
        await api.ready()
        return api
      } finally {
        delete process.env.WEBHOOK_DISPATCHER_ENABLED
      }
    }

    it('starts with WEBHOOK_DISPATCHER_ENABLED=true and sends what is due at boot', async () => {
      const id = await seed({ answer: '200' })
      const api = await subject({ enabled: true })

      try {
        await settles(id, 'delivered')
      } finally {
        await api.close()
      }
    })

    it('stays off without WEBHOOK_DISPATCHER_ENABLED', async () => {
      const id = await seed({ answer: '200' })
      const api = await subject()

      try {
        await pause(300)
        expect((await row(id)).status).toBe('pending')
      } finally {
        await api.close()
      }
    })

    it('keeps sending what becomes due on the following rounds', async () => {
      const api = await subject({ rounds: { intervalMs: 20 } })

      try {
        const id = await seed({ answer: '200' })
        await settles(id, 'delivered')
      } finally {
        await api.close()
      }
    })

    it('lets the round in flight record its outcome before closing the database', async () => {
      const id = await seed({ answer: 'hang' })
      const api = await subject({ enabled: true })
      for (let waited = 0; received.length === 0 && waited < 2000; waited += 10) await pause(10)

      const closed = api.close()
      await pause(50)
      releaseHung()
      await closed

      expect(await row(id)).toMatchObject({ status: 'delivered', locked_at: null })
    })

    const recorder = () => {
      const failures: string[] = []
      const log = {
        info: () => undefined,
        warn: () => undefined,
        error: (_context: unknown, message?: string) => void failures.push(message ?? ''),
      }
      return { failures, log }
    }

    it('stops the rounds on close', async () => {
      const { failures, log } = recorder()
      const api = await subject({ rounds: { intervalMs: 200, log } })
      await pause(50)

      await api.close()
      await pause(400)

      expect(failures).toEqual([])
    })

    it('does not schedule another round when the close arrives mid-round', async () => {
      const { failures, log } = recorder()
      await seed({ answer: 'hang' })
      const api = await subject({ rounds: { intervalMs: 20, log } })
      for (let waited = 0; received.length === 0 && waited < 2000; waited += 10) await pause(10)

      const closed = api.close()
      await pause(50)
      releaseHung()
      await closed
      await pause(200)

      expect(failures).toEqual([])
    })
  })
})
