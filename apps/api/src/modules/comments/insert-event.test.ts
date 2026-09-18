import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { insertEvent } from './repository.js'

const ANALYST = { id: 'dev@piposaude.com.br', type: 'user' } as const

describe('insertEvent', () => {
  let app: FastifyInstance
  let ticketId: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  beforeEach(async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
    })
    const ticket = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      cookies: {
        [SESSION_COOKIE_NAME]: login.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value,
      },
      payload: {
        enrollmentId: '00000000-0000-4000-8000-000000000201',
        enrollmentType: 'inclusion',
        companyId: '00000000-0000-4000-8000-000000000202',
        sourceSystem: 'enrollment-integrations',
        enrollmentSnapshot: { name: 'Test User' },
      },
    })
    ticketId = ticket.json().id
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  it('records what happened, with the person who caused it as the author', async () => {
    const { comment, created } = await insertEvent(
      app.db,
      {
        ticketId,
        eventType: 'assigned',
        body: 'Atribuído a Carla Porto',
        metadata: { to: 'carla@piposaude.com.br', from: null },
      },
      ANALYST,
    )

    expect(created).toBe(true)
    expect(comment).toMatchObject({
      kind: 'automated_event',
      eventType: 'assigned',
      authorId: ANALYST.id,
      metadata: { to: 'carla@piposaude.com.br', from: null },
    })
  })

  it('keeps the event out of the public cut unless it is told otherwise', async () => {
    const { comment } = await insertEvent(
      app.db,
      { ticketId, eventType: 'priority_changed', body: 'Prioridade alterada' },
      ANALYST,
    )

    expect(comment.visibility).toBe('private')
  })

  it('absorbs a redelivery without killing the transaction it was handed', async () => {
    const idempotencyKey = 'ei:enrollment-1:assigned'
    const event = {
      ticketId,
      eventType: 'assigned',
      body: 'Atribuído a Carla Porto',
      idempotencyKey,
    } as const

    const first = await insertEvent(app.db, event, ANALYST)

    const replay = await app.db.transaction().execute(async (trx) => {
      const again = await insertEvent(trx, event, ANALYST)
      await trx
        .updateTable('tickets')
        .set({ priority: 'urgent' })
        .where('id', '=', ticketId)
        .execute()
      return again
    })

    expect(replay.created).toBe(false)
    expect(replay.comment.id).toBe(first.comment.id)

    const rows = await app.db.selectFrom('ticket_comments').selectAll().execute()
    expect(rows).toHaveLength(1)

    // The change the event came with committed: the replay absorbed, not aborted.
    const ticket = await app.db
      .selectFrom('tickets')
      .select('priority')
      .where('id', '=', ticketId)
      .executeTakeFirstOrThrow()
    expect(ticket.priority).toBe('urgent')
  })

  it('rolls back with the change that caused it', async () => {
    await expect(
      app.db.transaction().execute(async (trx) => {
        await insertEvent(
          trx,
          { ticketId, eventType: 'assigned', body: 'Atribuído a Carla Porto' },
          ANALYST,
        )
        throw new Error('the assignment failed after the event was written')
      }),
    ).rejects.toThrow('the assignment failed')

    const rows = await app.db.selectFrom('ticket_comments').selectAll().execute()
    expect(rows).toHaveLength(0)
  })
})
