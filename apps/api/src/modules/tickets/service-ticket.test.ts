import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'

const SERVICE_ACCOUNT = 'cronjobs/enrollment-integrations-worker'
const IDENTITY_ID = '3f1a6d6e-9c1e-4f0b-9d0e-2b7a1c5f8e42'
const ENROLLMENT_ID = '00000000-0000-4000-8000-0000000002a1'
const COMPANY_ID = '00000000-0000-4000-8000-0000000002a2'

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

function serviceAccountToken(): string {
  const [namespace, name] = SERVICE_ACCOUNT.split('/')
  return [
    base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64url(
      JSON.stringify({
        sub: `system:serviceaccount:${namespace}:${name}`,
        exp: Math.floor(Date.now() / 1000) + 3600,
        'kubernetes.io': { namespace, serviceaccount: { name } },
      }),
    ),
    'not-a-signature',
  ].join('.')
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// The EI's own path, against a real Postgres and with no session anywhere: open
// a ticket, find it again to stay idempotent, read it back.
describe('a ticket opened by a service', () => {
  let app: FastifyInstance
  const fetchMock = vi.fn()
  const authorization = `Bearer ${serviceAccountToken()}`

  beforeAll(async () => {
    process.env.SERVICE_ALLOWED_ACCOUNTS = SERVICE_ACCOUNT
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.db.deleteFrom('tickets').where('enrollment_id', '=', ENROLLMENT_ID).execute()
    await app.close()
    delete process.env.SERVICE_ALLOWED_ACCOUNTS
  })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    // A fresh Response per call: a body can only be read once, and every
    // request here verifies its own token.
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ 'identity-id': IDENTITY_ID })),
    )
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await app.db.deleteFrom('tickets').where('enrollment_id', '=', ENROLLMENT_ID).execute()
  })

  async function openTicket() {
    return app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization },
      payload: {
        enrollmentId: ENROLLMENT_ID,
        enrollmentType: 'inclusion',
        companyId: COMPANY_ID,
        sourceSystem: 'enrollment-integrations',
        enrollmentSnapshot: { name: 'Test User' },
      },
    })
  }

  it('is created without any session', async () => {
    const response = await openTicket()

    expect(response.statusCode).toBe(201)
    expect(response.json().enrollmentId).toBe(ENROLLMENT_ID)
  })

  it('carries the subject, the HR contacts, the schedule and how it came in', async () => {
    const payload = {
      enrollmentId: ENROLLMENT_ID,
      enrollmentType: 'inclusion',
      companyId: COMPANY_ID,
      sourceSystem: 'enrollment-integrations',
      title: 'Bradesco | ACME LTDA | 🩺 Saúde | Inclusão de titular - MARIA SILVA',
      requester: { email: 'rh@acme.com.br', name: 'Sergio Gouveia' },
      collaborators: [{ email: 'dp@acme.com.br' }],
      actionDate: '2026-10-01T03:00:00.000Z',
      origin: 'automation-failure',
      enrollmentSnapshot: { name: 'Maria Silva' },
    }

    const response = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      headers: { authorization },
      payload,
    })

    expect(response.statusCode).toBe(201)
    const ticket = response.json()
    expect(ticket.title).toBe(payload.title)
    expect(ticket.requester).toEqual(payload.requester)
    expect(ticket.collaborators).toEqual(payload.collaborators)
    expect(ticket.actionDate).toBe(payload.actionDate)
    expect(ticket.origin).toBe(payload.origin)
    expect(ticket.status).toBe('broker-processing')
  })

  it('is told which ticket is open when it tries twice', async () => {
    const created = await openTicket()

    const again = await openTicket()

    expect(again.statusCode).toBe(409)
    expect(again.json().ticketId).toBe(created.json().id)
  })

  // What keeps the EI idempotent: it asks whether the enrollment already has a
  // ticket before opening another one.
  it('is found again by its enrollmentId', async () => {
    const created = await openTicket()

    const found = await app.inject({
      method: 'GET',
      url: `/api/tickets?enrollmentId=${ENROLLMENT_ID}`,
      headers: { authorization },
    })

    expect(found.statusCode).toBe(200)
    expect(found.json().data.map((ticket: { id: string }) => ticket.id)).toEqual([
      created.json().id,
    ])
  })

  it('does not come back in a search for another enrollment', async () => {
    await openTicket()

    const other = await app.inject({
      method: 'GET',
      url: '/api/tickets?enrollmentId=00000000-0000-4000-8000-0000000002ff',
      headers: { authorization },
    })

    expect(other.json().data).toEqual([])
  })

  it('is readable by id', async () => {
    const created = await openTicket()

    const read = await app.inject({
      method: 'GET',
      url: `/api/tickets/${created.json().id}`,
      headers: { authorization },
    })

    expect(read.statusCode).toBe(200)
    expect(read.json().enrollmentId).toBe(ENROLLMENT_ID)
  })

  it('cannot be patched by the service that opened it', async () => {
    const created = await openTicket()

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/tickets/${created.json().id}`,
      headers: { authorization },
      payload: { title: 'nope' },
    })

    expect(patch.statusCode).toBe(403)
  })
})
