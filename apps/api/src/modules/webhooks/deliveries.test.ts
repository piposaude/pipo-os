import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
import { enqueueStatusChange } from './deliveries.js'

const familySnapshot = {
  member_type: 'primary',
  primary: {
    profile: { tax_id: '222.222.222-22' },
    employment: { admission_date: '2026-10-01' },
  },
  dependents: [{ profile: { tax_id: '333.333.333-33' } }],
}

const member = (taxId: string) => ({
  taxId,
  idCardNumber: `C-${taxId}`,
  startDate: '2026-10-01',
})

describe('webhook deliveries of a status change', () => {
  let app: FastifyInstance
  let rootGroupId: string
  let cookies: Record<string, string>

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
    })
    cookies = {
      [SESSION_COOKIE_NAME]: login.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value,
    }
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  afterEach(async () => {
    await app.db.deleteFrom('outbound_webhook_deliveries').execute()
    await app.db.deleteFrom('webhook_configs').execute()
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('ticket_completion_members').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  const createConfig = (name: string, values: { active?: boolean; event_types?: string[] } = {}) =>
    app.db
      .insertInto('webhook_configs')
      .values({
        name,
        target_url: `https://${name}.example/pipodesk-webhook`,
        secret: 's',
        ...(values.active !== undefined && { active: values.active }),
        ...(values.event_types && { event_types: JSON.stringify(values.event_types) }),
      })
      .returning('id')
      .executeTakeFirstOrThrow()

  const openTicket = async (): Promise<string> => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      cookies,
      payload: {
        enrollmentId: '00000000-0000-4000-8000-000000000001',
        enrollmentType: 'inclusion',
        companyId: '00000000-0000-4000-8000-000000000002',
        sourceSystem: 'enrollment-integrations',
        enrollmentSnapshot: familySnapshot,
      },
    })
    const { id } = created.json()
    await app.db
      .updateTable('tickets')
      .set({ status: 'carrier-processing' })
      .where('id', '=', id)
      .execute()
    return id
  }

  const patchStatus = (id: string, payload: object) =>
    app.inject({ method: 'PATCH', url: `/api/tickets/${id}/status`, cookies, payload })

  const deliveries = () =>
    app.db.selectFrom('outbound_webhook_deliveries').selectAll().orderBy('target_url').execute()

  it('leaves one pending delivery per active destination subscribed to status changes', async () => {
    const ei = await createConfig('ei')
    const other = await createConfig('other')
    await createConfig('inactive', { active: false })
    await createConfig('unsubscribed', { event_types: ['ticket.created'] })
    const id = await openTicket()

    const response = await patchStatus(id, { status: 'broker-open-issue', reason: 'Falta RG' })

    expect(response.statusCode).toBe(200)
    const history = await app.db
      .selectFrom('ticket_status_history')
      .selectAll()
      .where('ticket_id', '=', id)
      .executeTakeFirstOrThrow()
    const rows = await deliveries()
    expect(rows.map((row) => [row.webhook_config_id, row.target_url, row.status])).toEqual([
      [ei.id, 'https://ei.example/pipodesk-webhook', 'pending'],
      [other.id, 'https://other.example/pipodesk-webhook', 'pending'],
    ])
    expect(rows[0]!.status_history_id).toBe(history.id)
    expect(rows[0]!.next_attempt_at).toBeInstanceOf(Date)
    expect(rows[0]!.payload).toMatchObject({
      delivery_id: rows[0]!.id,
      event_type: 'ticket.status_changed',
      occurred_at: history.created_at.toISOString(),
      ticket_id: id,
      from_status: 'carrier-processing',
      to_status: 'broker-open-issue',
      reason: 'Falta RG',
      actor: { type: 'user', id: history.author_id },
      completion: null,
    })
  })

  it('carries the lives of the completion, in the order of the movement', async () => {
    await createConfig('ei')
    const id = await openTicket()

    const response = await patchStatus(id, {
      status: 'completed',
      completion: { members: [member('33333333333'), member('22222222222')] },
    })

    expect(response.statusCode).toBe(200)
    const [row] = await deliveries()
    expect(row!.payload).toMatchObject({
      to_status: 'completed',
      completion: {
        members: [
          { tax_id: '22222222222', id_card_number: 'C-22222222222', effective_date: '2026-10-01' },
          { tax_id: '33333333333', id_card_number: 'C-33333333333', effective_date: '2026-10-01' },
        ],
        end_date: null,
      },
    })
  })

  it('leaves nothing behind when the completion is refused', async () => {
    await createConfig('ei')
    const id = await openTicket()

    const response = await patchStatus(id, { status: 'completed' })

    expect(response.statusCode).toBe(422)
    expect(await deliveries()).toEqual([])
  })

  it('leaves nothing behind when the ticket is already closed', async () => {
    const id = await openTicket()
    await patchStatus(id, { status: 'cancelled' })
    await createConfig('ei')

    const response = await patchStatus(id, { status: 'broker-processing' })

    expect(response.statusCode).toBe(422)
    expect(await deliveries()).toEqual([])
  })

  it('keeps a single delivery when the same change is enqueued twice', async () => {
    await createConfig('ei')
    const id = await openTicket()
    await patchStatus(id, { status: 'broker-open-issue' })
    const [first] = await deliveries()
    const history = await app.db
      .selectFrom('ticket_status_history')
      .select(['id', 'created_at'])
      .where('id', '=', first!.status_history_id)
      .executeTakeFirstOrThrow()

    await enqueueStatusChange(app.db, history.id, {
      ticket: { id, displayNumber: 'M1', enrollmentId: id, companyId: id },
      fromStatus: 'carrier-processing',
      toStatus: 'broker-open-issue',
      reason: null,
      actor: { type: 'user', id: 'someone' },
      occurredAt: history.created_at.toISOString(),
      completion: null,
    })

    expect((await deliveries()).map((row) => row.id)).toEqual([first!.id])
  })

  it('undoes the whole transition when the delivery cannot be written', async () => {
    await createConfig('ei')
    const id = await openTicket()
    await sql`
      CREATE FUNCTION refuse_delivery() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'refused'; END;
      $$ LANGUAGE plpgsql
    `.execute(app.db)
    await sql`
      CREATE TRIGGER trg_refuse_delivery BEFORE INSERT ON outbound_webhook_deliveries
      FOR EACH ROW EXECUTE FUNCTION refuse_delivery()
    `.execute(app.db)

    try {
      const response = await patchStatus(id, {
        status: 'completed',
        completion: { members: [member('22222222222'), member('33333333333')] },
      })

      expect(response.statusCode).toBe(500)
    } finally {
      await sql`DROP TRIGGER trg_refuse_delivery ON outbound_webhook_deliveries`.execute(app.db)
      await sql`DROP FUNCTION refuse_delivery`.execute(app.db)
    }
    const ticket = await app.db
      .selectFrom('tickets')
      .select(['status', 'closed_at'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    expect(ticket).toEqual({ status: 'carrier-processing', closed_at: null })
    const leftovers = await Promise.all([
      app.db.selectFrom('ticket_status_history').select('id').where('ticket_id', '=', id).execute(),
      app.db
        .selectFrom('ticket_completion_members')
        .select('tax_id')
        .where('ticket_id', '=', id)
        .execute(),
    ])
    expect(leftovers).toEqual([[], []])
  })
})
