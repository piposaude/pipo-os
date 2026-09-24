import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { businessToday } from '../../shared/business-date.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { sessionCookieFor } from '../auth/session.test-helpers.js'
import { createRootGroup } from '../groups/root.test-helpers.js'

const POLICY = 'admin/allow/administrate/pipodesk/ticket'
const ANA = 'ana@pipo.health'
const BRUNO = 'bruno@pipo.health'
const EI = 'svc:enrollment-integrations'

type Comment = {
  authorId: string
  authorType?: 'user' | 'service'
  visibility?: 'public' | 'private'
  channel?: 'internal' | 'email'
  kind?: 'manual' | 'automated_event'
  eventType?: string | null
  at?: string
}

describe('GET /api/tickets/inbox', () => {
  let app: FastifyInstance
  let rootGroupId: string
  let ana: string
  let bruno: string

  const yesterday = (): string =>
    new Date(Date.parse(`${businessToday()}T12:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10)
  const dayBefore = (): string =>
    new Date(Date.parse(`${businessToday()}T12:00:00.000Z`) - 2 * 86_400_000)
      .toISOString()
      .slice(0, 10)

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)
    ana = sessionCookieFor(app, ANA, [POLICY])
    bruno = sessionCookieFor(app, BRUNO, [POLICY])
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
  })

  const ticket = async (
    title: string,
    {
      assigneeId = ANA,
      closedAt = null,
    }: { assigneeId?: string | null; closedAt?: string | null } = {},
  ): Promise<string> => {
    const row = await app.db
      .insertInto('tickets')
      .values({
        enrollment_id: randomUUID(),
        enrollment_type: 'inclusion',
        company_id: randomUUID(),
        source_system: 'enrollment-integrations',
        status: closedAt ? 'completed' : 'missing-documents',
        group_id: rootGroupId,
        assignee_id: assigneeId,
        closed_at: closedAt,
        enrollment_snapshot: JSON.stringify({}),
        tags: [],
        title,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  const comment = async (ticketId: string, c: Comment): Promise<void> => {
    await app.db
      .insertInto('ticket_comments')
      .values({
        ticket_id: ticketId,
        kind: c.kind ?? 'manual',
        channel: c.channel ?? 'internal',
        visibility: c.visibility ?? 'public',
        event_type: c.eventType ?? null,
        author_id: c.authorId,
        author_type: c.authorType ?? 'user',
        body: 'Segue o documento.',
        ...(c.at && { created_at: c.at }),
      })
      .execute()
  }

  const inbox = async (cookie = ana) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tickets/inbox',
      cookies: { [SESSION_COOKIE_NAME]: cookie },
    })
    return { status: response.statusCode, body: response.json() }
  }

  const titles = (body: { data: { title: string | null }[] }) =>
    body.data.map((row) => row.title).sort()

  it('brings my ticket with a public comment from someone else', async () => {
    await comment(await ticket('respondido'), { authorId: BRUNO })

    const { status, body } = await inbox()

    expect(status).toBe(200)
    expect(titles(body)).toEqual(['respondido'])
    expect(body.total).toBe(1)
  })

  it('brings the HR reply the integration posts', async () => {
    await comment(await ticket('rh-respondeu'), {
      authorId: EI,
      authorType: 'service',
      kind: 'automated_event',
      eventType: 'hr_platform_reply',
    })

    expect(titles((await inbox()).body)).toEqual(['rh-respondeu'])
  })

  it('brings an e-mail even when it is not public', async () => {
    await comment(await ticket('por-email'), {
      authorId: BRUNO,
      channel: 'email',
      visibility: 'private',
    })

    expect(titles((await inbox()).body)).toEqual(['por-email'])
  })

  it('leaves out a private comment', async () => {
    await comment(await ticket('nota-interna'), { authorId: BRUNO, visibility: 'private' })

    expect(titles((await inbox()).body)).toEqual([])
  })

  it('leaves out my own public comment', async () => {
    await comment(await ticket('eu-respondi'), { authorId: ANA })

    expect(titles((await inbox()).body)).toEqual([])
  })

  it('leaves out a ticket that was only handed to me', async () => {
    const id = await ticket('reatribuido', { assigneeId: BRUNO })
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${id}`,
      cookies: { [SESSION_COOKIE_NAME]: bruno },
      payload: { assigneeId: ANA },
    })
    expect(patch.statusCode).toBe(200)

    expect(titles((await inbox()).body)).toEqual([])
  })

  it('leaves out a ticket someone else is responsible for', async () => {
    await comment(await ticket('do-bruno', { assigneeId: BRUNO }), {
      authorId: EI,
      authorType: 'service',
    })

    expect(titles((await inbox()).body)).toEqual([])
  })

  it('counts a comment from the start of yesterday in São Paulo', async () => {
    await comment(await ticket('ontem-cedo'), {
      authorId: BRUNO,
      at: `${yesterday()}T00:05:00-03:00`,
    })

    expect(titles((await inbox()).body)).toEqual(['ontem-cedo'])
  })

  it('leaves out a comment from the day before yesterday', async () => {
    await comment(await ticket('anteontem'), {
      authorId: BRUNO,
      at: `${dayBefore()}T23:55:00-03:00`,
    })

    expect(titles((await inbox()).body)).toEqual([])
  })

  it('keeps a closed ticket', async () => {
    await comment(await ticket('fechado', { closedAt: new Date().toISOString() }), {
      authorId: BRUNO,
    })

    expect(titles((await inbox()).body)).toEqual(['fechado'])
  })

  it('lists a ticket once however many replies it got', async () => {
    const id = await ticket('muitas')
    await comment(id, { authorId: BRUNO })
    await comment(id, { authorId: EI, authorType: 'service' })

    const { body } = await inbox()

    expect(titles(body)).toEqual(['muitas'])
    expect(body.total).toBe(1)
  })

  it('answers the same row the queue projection does', async () => {
    const id = await ticket('mesma-linha')
    await comment(id, { authorId: BRUNO })

    const rows = await app.inject({
      method: 'GET',
      url: '/api/tickets/rows?window=all',
      cookies: { [SESSION_COOKIE_NAME]: ana },
    })

    expect((await inbox()).body.data).toEqual(rows.json().data)
  })
})
