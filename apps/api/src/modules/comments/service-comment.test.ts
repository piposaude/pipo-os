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
