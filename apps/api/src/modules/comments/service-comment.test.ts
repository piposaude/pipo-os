import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
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
  let rootGroupId: string
  let sessionCookie: string
  let ticketId: string
  const fetchMock = vi.fn()
  const warnings: unknown[][] = []
  const token = serviceAccountToken(SERVICE_NAME)

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    process.env.SERVICE_ALLOWED_ACCOUNTS = `default/${SERVICE_NAME}`
    app = buildApp()
    /* The route logs on the request's child logger, which a spy on `app.log`
       never sees — the hook is what puts the lines within reach of a test. */
    app.addHook('onRequest', (request, _reply, done) => {
      const warn = request.log.warn.bind(request.log)
      request.log.warn = ((...args: unknown[]) => {
        warnings.push(args)
        return warn(...(args as Parameters<typeof warn>))
      }) as typeof request.log.warn
      done()
    })
    await app.ready()
    rootGroupId = await createRootGroup(app.db)

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
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
    delete process.env.SERVICE_ALLOWED_ACCOUNTS
  })

  /* A `Response` body reads once, so `mockResolvedValue` of a single one turns
     the second service call of any test into a 503. An implementation, not a
     value: each verify-token gets its own. */
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ 'identity-id': IDENTITY_ID })),
    )
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    warnings.length = 0
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
    /* Read off the response and not off the column: the type is published now,
       and what the caller gets back is what the front will separate on. */
    expect(response.json()).toMatchObject({
      authorId: `svc:${SERVICE_NAME}`,
      authorType: 'service',
    })
  })

  describe('redelivery of the same event', () => {
    const replayed = {
      kind: 'automated_event',
      eventType: 'enrollment_cancellation_requested',
      visibility: 'private',
      body: 'Movimentação cancelada na origem',
      idempotencyKey: 'ei:enrollment-1:cancellation',
    }

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

    it('warns when the key is reused for a different event, and keeps the first line', async () => {
      const first = await post(ticketId)

      const reused = await app.inject({
        method: 'POST',
        url: `/api/tickets/${ticketId}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ...replayed, body: 'Outro evento, mesma chave' },
      })

      expect(reused.statusCode).toBe(200)
      expect(reused.json().id).toBe(first.json().id)
      expect(reused.json().body).toBe(replayed.body)
      expect(warnings).toContainEqual([
        expect.objectContaining({ idempotencyKey: replayed.idempotencyKey, bodyMismatch: true }),
        expect.stringContaining('reused'),
      ])

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

  it('refuses an event type outside the catalog, naming the field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: 'automated_event',
        eventType: 'ticket_exploded',
        visibility: 'private',
        body: 'algo aconteceu',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().details[0]).toMatchObject({ field: 'eventType' })
  })

  it('cannot post the event the API records about its own writes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: 'automated_event',
        eventType: 'assigned',
        visibility: 'private',
        body: 'Atribuído a Carla Porto',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().details[0]).toMatchObject({ field: 'eventType' })

    const rows = await app.db.selectFrom('ticket_comments').selectAll().execute()
    expect(rows).toHaveLength(0)
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

  it('is the only kind of caller that can write one — a person is refused', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: {
        kind: 'automated_event',
        eventType: 'hr_platform_reply',
        visibility: 'private',
        body: 'O RH respondeu',
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
