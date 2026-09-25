import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
import { claimDue } from './dispatcher.js'

describe('webhook dispatcher', () => {
  let app: FastifyInstance
  let rootGroupId: string
  let ticketId: string
  let configId: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  beforeEach(async () => {
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
    } = {},
  ): Promise<string> => {
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
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  const ids = (claimed: { id: string }[]) => claimed.map((delivery) => delivery.id)

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

    it('hands over the destination, its current secret and the body to sign', async () => {
      const id = await seed({ payload: { delivery_id: 'd', to_status: 'completed' } })
      await app.db.updateTable('webhook_configs').set({ secret: 'rotated' }).execute()

      const [delivery] = await claimDue(app.db)

      expect(delivery).toMatchObject({
        id,
        ticketId,
        webhookConfigId: configId,
        targetUrl: 'http://127.0.0.1:1/pipodesk-webhook',
        secret: 'rotated',
        attemptCount: 0,
      })
      expect(JSON.parse(delivery!.body)).toEqual({ delivery_id: 'd', to_status: 'completed' })
    })
  })
})
