import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { usersPage } from '../../shared/json.test-helpers.js'

const ANA = { id: 'u1', email: 'ana.souza@piposaude.com.br', name: 'Ana Souza' }
const BRUNO = { id: 'u2', email: 'bruno@piposaude.com.br', name: 'Bruno Lima' }

describe('users routes', () => {
  let app: FastifyInstance
  const fetchMock = vi.fn()

  // A fresh app per test, because the snapshot lives in the service: a cold
  // start is what lets one test see the upstream refusal another one hid.
  beforeEach(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    vi.stubEnv('SERVICE_ACCOUNT_TOKEN', 'token-for-tests')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)

    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    delete process.env.DEV_LOGIN_ENABLED
  })

  const sessionFor = async (policies: string[]): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies },
    })
    return response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)!.value
  }

  const listUsers = async (policies: string[], query = '') => {
    const cookie = await sessionFor(policies)
    return app.inject({
      method: 'GET',
      url: `/api/users${query}`,
      cookies: { [SESSION_COOKIE_NAME]: cookie },
    })
  }

  it('returns 401 without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/users' })

    expect(response.statusCode).toBe(401)
  })

  it('returns 403 for a session that carries no Pipodesk policy', async () => {
    const response = await listUsers(['admin/allow/administrate/company/*'])

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers the queue, which only holds the ticket policy', async () => {
    fetchMock.mockImplementation(() => usersPage([ANA, BRUNO]))

    const response = await listUsers(['admin/allow/administrate/pipodesk/ticket'])

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [
        { email: 'ana.souza@piposaude.com.br', name: 'Ana Souza' },
        { email: 'bruno@piposaude.com.br', name: 'Bruno Lima' },
      ],
    })
  })

  it('answers the structure screens, which hold the other policy', async () => {
    fetchMock.mockImplementation(() => usersPage([ANA]))

    const response = await listUsers(['admin/allow/administrate/pipodesk/structure'])

    expect(response.statusCode).toBe(200)
  })

  it('filters by the search term', async () => {
    fetchMock.mockImplementation(() => usersPage([ANA, BRUNO]))

    const response = await listUsers(['admin/allow/administrate/pipodesk/*'], '?search=bruno')

    expect(response.json().data).toEqual([{ email: 'bruno@piposaude.com.br', name: 'Bruno Lima' }])
  })

  it('answers 503 when the auth-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    const response = await listUsers(['admin/allow/administrate/pipodesk/*'])

    expect(response.statusCode).toBe(503)
  })

  it('refuses an unbounded search term', async () => {
    fetchMock.mockImplementation(() => usersPage([ANA]))

    const response = await listUsers(
      ['admin/allow/administrate/pipodesk/*'],
      `?search=${'a'.repeat(256)}`,
    )

    expect(response.statusCode).toBe(400)
  })
})
