import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

const familySnapshot = {
  member_type: 'primary',
  primary: {
    profile: { tax_id: '222.222.222-22' },
    employment: { admission_date: '2026-10-01' },
  },
  dependents: [{ profile: { tax_id: '333.333.333-33' } }],
}

const member = (taxId: string, overrides: object = {}) => ({
  taxId,
  idCardNumber: `C-${taxId}`,
  startDate: '2026-10-01',
  ...overrides,
})

const bothChannels = [
  { channel: 'internal', body: 'carteirinhas emitidas' },
  { channel: 'platform', body: 'carteirinhas emitidas' },
]

describe('POST /api/tickets/:id/submissions', () => {
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
    await app.db.deleteFrom('ticket_completion_members').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  let enrollmentSeq = 0
  const openTicket = async (status = 'carrier-processing'): Promise<string> => {
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
        enrollmentSnapshot: familySnapshot,
      },
    })
    const { id } = created.json()
    await app.db.updateTable('tickets').set({ status }).where('id', '=', id).execute()
    return id
  }

  const submit = (id: string, payload: object) =>
    app.inject({
      method: 'POST',
      url: `/api/tickets/${id}/submissions`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload,
    })

  const commentsOf = (id: string) =>
    app.db
      .selectFrom('ticket_comments')
      .selectAll()
      .where('ticket_id', '=', id)
      .orderBy('visibility')
      .execute()

  const historyOf = (id: string) =>
    app.db.selectFrom('ticket_status_history').selectAll().where('ticket_id', '=', id).execute()

  const statusOf = async (id: string) =>
    (
      await app.db
        .selectFrom('tickets')
        .select('status')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).status

  it('writes both parts and the completion under one submission', async () => {
    const id = await openTicket()

    const response = await submit(id, {
      parts: bothChannels,
      status: {
        status: 'completed',
        completion: { members: [member('22222222222'), member('33333333333')] },
      },
    })

    expect(response.statusCode).toBe(201)
    const { submissionId, ticket, comments } = response.json()
    expect(ticket).toMatchObject({ id, status: 'completed' })
    expect(ticket.closedAt).not.toBeNull()
    expect(comments.map((c: { visibility: string }) => c.visibility).sort()).toEqual([
      'private',
      'public',
    ])
    expect(await commentsOf(id)).toMatchObject([
      { channel: 'internal', visibility: 'private', submission_id: submissionId },
      { channel: 'internal', visibility: 'public', submission_id: submissionId },
    ])
    expect(await historyOf(id)).toMatchObject([
      { to_status: 'completed', submission_id: submissionId },
    ])
  })

  it('refuses the completion field by field and writes nothing, not even the text', async () => {
    const id = await openTicket()

    const response = await submit(id, {
      parts: bothChannels,
      status: {
        status: 'completed',
        completion: {
          members: [member('22222222222', { idCardNumber: '' }), member('33333333333')],
        },
      },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().details.map((d: { field: string }) => d.field)).toEqual([
      'members[22222222222].idCardNumber',
    ])
    expect(await commentsOf(id)).toEqual([])
    expect(await historyOf(id)).toEqual([])
    expect(await statusOf(id)).toBe('carrier-processing')
  })

  it('refuses a status on a closed ticket and writes nothing', async () => {
    const id = await openTicket('cancelled')

    const response = await submit(id, {
      parts: bothChannels,
      status: { status: 'carrier-processing' },
    })

    expect(response.statusCode).toBe(422)
    expect(await commentsOf(id)).toEqual([])
    expect(await historyOf(id)).toEqual([])
  })

  it('takes text alone on a closed ticket', async () => {
    const id = await openTicket('completed')

    const response = await submit(id, { parts: [bothChannels[0]] })

    expect(response.statusCode).toBe(201)
    expect(response.json().ticket.status).toBe('completed')
    expect(await commentsOf(id)).toHaveLength(1)
    expect(await historyOf(id)).toEqual([])
  })

  it('changes the status with no text', async () => {
    const id = await openTicket()

    const response = await submit(id, {
      status: { status: 'missing-documents', reason: 'falta o RG' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().comments).toEqual([])
    expect(await historyOf(id)).toMatchObject([
      { to_status: 'missing-documents', reason: 'falta o RG' },
    ])
  })

  it('records the submission a reply answers', async () => {
    const id = await openTicket()
    const first = await submit(id, { status: { status: 'missing-documents' } })

    const response = await submit(id, {
      parts: [bothChannels[1]],
      inReplyTo: first.json().submissionId,
    })

    expect(response.statusCode).toBe(201)
    expect(await commentsOf(id)).toMatchObject([{ in_reply_to: first.json().submissionId }])
  })

  it('refuses a reply to a submission of another ticket, and writes nothing', async () => {
    const other = await openTicket()
    const elsewhere = await submit(other, { parts: [bothChannels[0]] })
    const id = await openTicket()

    const response = await submit(id, {
      parts: [bothChannels[0]],
      status: { status: 'missing-documents' },
      inReplyTo: elsewhere.json().submissionId,
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().details.map((d: { field: string }) => d.field)).toEqual(['inReplyTo'])
    expect(await commentsOf(id)).toEqual([])
    expect(await historyOf(id)).toEqual([])
  })

  it('refuses a reply to a reply, since the thread keeps only its root', async () => {
    const id = await openTicket()
    const root = await submit(id, { parts: [bothChannels[0]] })
    const reply = await submit(id, {
      parts: [bothChannels[1]],
      inReplyTo: root.json().submissionId,
    })

    const response = await submit(id, {
      parts: [bothChannels[0]],
      inReplyTo: reply.json().submissionId,
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().details.map((d: { field: string }) => d.field)).toEqual(['inReplyTo'])
    expect(await commentsOf(id)).toHaveLength(2)
  })

  it('takes two parts at the longest body the schema accepts, in three-byte characters', async () => {
    const id = await openTicket()
    const longest = '€'.repeat(50_000)

    const response = await submit(id, {
      parts: [
        { channel: 'internal', body: longest },
        { channel: 'platform', body: longest },
      ],
    })

    expect(response.statusCode).toBe(201)
  })

  it('answers 404 for a ticket that does not exist', async () => {
    const response = await submit('00000000-0000-4000-8000-0000000004ff', {
      parts: [bothChannels[0]],
    })

    expect(response.statusCode).toBe(404)
  })

  it('answers 400 to a submission with neither text nor status', async () => {
    const id = await openTicket()

    const response = await submit(id, { parts: [] })

    expect(response.statusCode).toBe(400)
  })
})
