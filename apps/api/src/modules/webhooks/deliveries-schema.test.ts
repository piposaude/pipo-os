import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createRootGroup } from '../groups/root.test-helpers.js'

describe('outbound_webhook_deliveries', () => {
  let app: FastifyInstance
  let rootGroupId: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
  })

  afterEach(async () => {
    await app.db.deleteFrom('outbound_webhook_deliveries').execute()
    await app.db.deleteFrom('webhook_configs').execute()
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  const createConfig = () =>
    app.db
      .insertInto('webhook_configs')
      .values({ name: 'ei', target_url: 'https://ei.example/pipodesk-webhook', secret: 's' })
      .returningAll()
      .executeTakeFirstOrThrow()

  const createHistory = async () => {
    const ticket = await app.db
      .insertInto('tickets')
      .values({
        enrollment_id: '00000000-0000-4000-8000-000000000001',
        enrollment_type: 'inclusion',
        company_id: '00000000-0000-4000-8000-000000000002',
        source_system: 'enrollment-integrations',
        status: 'carrier-processing',
        group_id: rootGroupId,
        enrollment_snapshot: JSON.stringify({}),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return app.db
      .insertInto('ticket_status_history')
      .values({
        ticket_id: ticket.id,
        from_status: 'broker-processing',
        to_status: 'carrier-processing',
        author_id: 'analyst@pipo.health',
        author_type: 'user',
      })
      .returning(['id', 'ticket_id'])
      .executeTakeFirstOrThrow()
  }

  const deliver = async (status?: string) => {
    const config = await createConfig()
    const history = await createHistory()
    return app.db
      .insertInto('outbound_webhook_deliveries')
      .values({
        ticket_id: history.ticket_id,
        status_history_id: history.id,
        webhook_config_id: config.id,
        target_url: config.target_url,
        payload: JSON.stringify({}),
        ...(status && { status }),
      })
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  it('is due right away and keeps no copy of the secret', async () => {
    const row = await deliver()

    expect(row.status).toBe('pending')
    expect(row.next_attempt_at).toBeInstanceOf(Date)
    expect(row).not.toHaveProperty('signing_secret')
    expect(row).toMatchObject({ locked_at: null, response_status: null })
  })

  it('refuses a status the dispatcher does not know', async () => {
    await expect(deliver('sent')).rejects.toThrow(/outbound_webhook_deliveries_status_check/)
  })

  it('subscribes a new destination to status changes by default', async () => {
    const config = await createConfig()

    expect(config.event_types).toEqual(['ticket.status_changed'])
  })

  it('indexes only the deliveries still waiting to be sent', async () => {
    const { rows } = await sql<{ indexdef: string }>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_outbound_deliveries_due'
    `.execute(app.db)

    expect(rows[0]?.indexdef).toMatch(/\(next_attempt_at\) WHERE .*pending.*failed/)
  })
})
