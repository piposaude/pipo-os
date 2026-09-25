import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

const note = [{ channel: 'internal', body: 'cobrado do RH' }]

describe('pendencies in POST /api/tickets/:id/submissions', () => {
  let app: FastifyInstance
  let sessionCookie: string
  let rootGroupId: string

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
    sessionCookie = login.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value
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
    await app.db.deleteFrom('pendency_items').where('id', 'like', 'test-%').execute()
  })

  let enrollmentSeq = 0
  const openTicket = async (): Promise<string> => {
    enrollmentSeq += 1
    const created = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: {
        enrollmentId: `00000000-0000-4000-8000-${String(enrollmentSeq).padStart(12, '0')}`,
        enrollmentType: 'inclusion',
        companyId: '00000000-0000-4000-8000-000000000402',
        sourceSystem: 'enrollment-integrations',
        enrollmentSnapshot: {},
      },
    })
    return created.json().id
  }

  const submit = (id: string, payload: object) =>
    app.inject({
      method: 'POST',
      url: `/api/tickets/${id}/submissions`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: { submissionId: randomUUID(), ...payload },
    })

  const pendencyEventsOf = (id: string) =>
    app.db
      .selectFrom('ticket_comments')
      .selectAll()
      .where('ticket_id', '=', id)
      .where('event_type', '=', 'pendency_changed')
      .orderBy('body')
      .execute()

  const manualOf = (id: string) =>
    app.db
      .selectFrom('ticket_comments')
      .selectAll()
      .where('ticket_id', '=', id)
      .where('kind', '=', 'manual')
      .execute()

  it('keeps the pendency events out of the submission, as activity lines at its instant', async () => {
    const id = await openTicket()

    const response = await submit(id, {
      parts: note,
      pendencies: { opened: ['rg', 'cpf'], resolved: ['carta-empresa'] },
    })

    expect(response.statusCode).toBe(201)
    const [comment] = await manualOf(id)
    const events = await pendencyEventsOf(id)
    expect(
      events.map((e) => ({ body: e.body, metadata: e.metadata, visibility: e.visibility })),
    ).toEqual([
      {
        body: 'Pendência resolvida',
        metadata: { action: 'resolved', itemIds: ['carta-empresa'] },
        visibility: 'private',
      },
      {
        body: 'Pendências marcadas',
        metadata: { action: 'opened', itemIds: ['rg', 'cpf'] },
        visibility: 'private',
      },
    ])
    for (const event of events) {
      expect(event.submission_id).toBeNull()
      expect(event.created_at).toEqual(comment.created_at)
      expect(event.author_type).toBe('user')
      expect(event.author_id).toBe(comment.author_id)
    }
  })

  it('answers a replayed submission without recording the pendencies twice', async () => {
    const id = await openTicket()
    const payload = { submissionId: randomUUID(), parts: note, pendencies: { opened: ['rg'] } }

    const first = await submit(id, payload)
    const replay = await submit(id, payload)

    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toEqual(first.json())
    expect(await pendencyEventsOf(id)).toHaveLength(1)
  })

  it('refuses an item outside the catalog by its place in the list, and writes nothing', async () => {
    const id = await openTicket()

    const response = await submit(id, {
      parts: note,
      status: { status: 'missing-documents' },
      pendencies: { opened: ['rg', 'passaporte'] },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().details).toEqual([
      expect.objectContaining({ field: 'pendencies.opened[1]', code: 'unknown_pendency_item' }),
    ])
    expect(await manualOf(id)).toEqual([])
    expect(await pendencyEventsOf(id)).toEqual([])
    const ticket = await app.db
      .selectFrom('tickets')
      .select('status')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    expect(ticket.status).not.toBe('missing-documents')
  })

  it('refuses to open a retired item and still resolves one', async () => {
    const id = await openTicket()
    await app.db
      .insertInto('pendency_items')
      .values({
        id: 'test-retired',
        label: 'Retirado',
        category: 'document',
        position: 1000,
        active: false,
      })
      .execute()

    const opened = await submit(id, { parts: note, pendencies: { reopened: ['test-retired'] } })
    const resolved = await submit(id, { parts: note, pendencies: { resolved: ['test-retired'] } })

    expect(opened.statusCode).toBe(422)
    expect(opened.json().details).toEqual([
      expect.objectContaining({
        field: 'pendencies.reopened[0]',
        code: 'inactive_pendency_item',
      }),
    ])
    expect(resolved.statusCode).toBe(201)
  })
})
