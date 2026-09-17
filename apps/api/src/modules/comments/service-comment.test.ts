import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { jsonResponse } from '../../shared/json.test-helpers.js'

const SERVICE_NAME = 'enrollment-integrations-worker'
const IDENTITY_ID = '3f1a6d6e-9c1e-4f0b-9d0e-2b7a1c5f8e42'

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

function serviceAccountToken(name: string): string {
  return [
    base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64url(
      JSON.stringify({
        sub: `system:serviceaccount:default:${name}`,
        exp: Math.floor(Date.now() / 1000) + 3600,
        'kubernetes.io': { namespace: 'default', serviceaccount: { name } },
      }),
    ),
    'not-a-signature',
  ].join('.')
}

function cookieValue(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string | null {
  return response.cookies.find((cookie) => cookie.name === name)?.value ?? null
}

describe('a comment written by a service', () => {
  let app: FastifyInstance
  let sessionCookie: string
  let ticketId: string
  const fetchMock = vi.fn()
  const token = serviceAccountToken(SERVICE_NAME)

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    process.env.SERVICE_ALLOWED_ACCOUNTS = `default/${SERVICE_NAME}`
    app = buildApp()
    await app.ready()

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
    })
    sessionCookie = cookieValue(login, SESSION_COOKIE_NAME)!

    const ticket = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: {
        enrollmentId: '00000000-0000-4000-8000-000000000101',
        enrollmentType: 'inclusion',
        companyId: '00000000-0000-4000-8000-000000000102',
        sourceSystem: 'enrollment-integrations',
        enrollmentSnapshot: { name: 'Test User' },
      },
    })
    ticketId = ticket.json().id
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('tickets').execute()
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
    delete process.env.SERVICE_ALLOWED_ACCOUNTS
  })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(jsonResponse({ 'identity-id': IDENTITY_ID }))
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await app.db.deleteFrom('ticket_comments').execute()
  })

  it('is stored with the service as its author', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${token}` },
      payload: { visibility: 'private', body: 'operadora confirmou a inclusão' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().authorId).toBe(`svc:${SERVICE_NAME}`)
    const row = await app.db
      .selectFrom('ticket_comments')
      .select('author_type')
      .where('id', '=', response.json().id)
      .executeTakeFirstOrThrow()
    expect(row.author_type).toBe('service')
  })

  /* The EI writes from a Kafka consumer: a redelivery replays the same event,
     and the chronology is the screen the operation reads. The second pass has
     to find the first line, not add one and not fail. */
  describe('redelivery of the same event', () => {
    const replayed = {
      kind: 'automated_event',
      eventType: 'enrollment_cancellation_requested',
      visibility: 'private',
      body: 'Movimentação cancelada na origem',
      idempotencyKey: 'ei:enrollment-1:cancellation',
    }

    /* A `Response` body reads once, so the shared `mockResolvedValue` of the
       outer `beforeEach` turns the second verify-token of a test into a 503.
       These tests are the first to call as a service twice. */
    beforeEach(() => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(jsonResponse({ 'identity-id': IDENTITY_ID })),
      )
    })

    const post = (ticket: string) =>
      app.inject({
        method: 'POST',
        url: `/api/tickets/${ticket}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: replayed,
      })

    it('gives back the line that is already there, and writes no second one', async () => {
      const first = await post(ticketId)
      const second = await post(ticketId)

      expect(first.statusCode).toBe(201)
      expect(second.statusCode).toBe(200)
      expect(second.json().id).toBe(first.json().id)

      const rows = await app.db.selectFrom('ticket_comments').selectAll().execute()
      expect(rows).toHaveLength(1)
    })

    it('is scoped to the ticket, so the same key elsewhere is another event', async () => {
      const other = await app.inject({
        method: 'POST',
        url: '/api/tickets',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        payload: {
          enrollmentId: '00000000-0000-4000-8000-000000000103',
          enrollmentType: 'inclusion',
          companyId: '00000000-0000-4000-8000-000000000102',
          sourceSystem: 'enrollment-integrations',
          enrollmentSnapshot: { name: 'Other User' },
        },
      })

      expect((await post(ticketId)).statusCode).toBe(201)
      expect((await post(other.json().id)).statusCode).toBe(201)
    })
  })

  it('writes the automated event it says it is writing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: 'automated_event',
        eventType: 'document_signature_sent',
        visibility: 'private',
        body: 'Documento enviado para assinatura',
        metadata: { documentType: 'termo-adesao' },
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      kind: 'automated_event',
      eventType: 'document_signature_sent',
      metadata: { documentType: 'termo-adesao' },
      authorId: `svc:${SERVICE_NAME}`,
    })
  })

  it('puts the automated event in the chronology as an event, not as a comment', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: 'automated_event',
        eventType: 'hr_platform_reply',
        visibility: 'public',
        body: 'segue o RG',
        metadata: { userEmail: 'rh@empresa.com.br' },
      },
    })

    const timeline = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/timeline`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })

    expect(timeline.json().data[0]).toMatchObject({
      type: 'event',
      eventType: 'hr_platform_reply',
      metadata: { userEmail: 'rh@empresa.com.br' },
    })
  })

  // A person writing "Sistema: atribuído a mim" is forgery, and the chronology
  // is what the operation reads to know what happened.
  it('is the only kind of caller that can write one — a person is refused', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: {
        kind: 'automated_event',
        eventType: 'assigned',
        visibility: 'private',
        body: 'Atribuído a mim',
      },
    })

    expect(response.statusCode).toBe(403)
    const rows = await app.db.selectFrom('ticket_comments').selectAll().execute()
    expect(rows).toHaveLength(0)
  })

  it('shows up in the chronology under the same author', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${token}` },
      payload: { visibility: 'private', body: 'operadora confirmou a inclusão' },
    })

    const timeline = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/timeline`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })

    expect(timeline.json().data[0].authorId).toBe(`svc:${SERVICE_NAME}`)
  })

  // Changing status is not something the EI does, so that route never opened
  // itself to a service — and the author of a status change stays a person.
  it('cannot change the status of the ticket it commented on', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'completed' },
    })

    expect(response.statusCode).toBe(403)
  })
})
