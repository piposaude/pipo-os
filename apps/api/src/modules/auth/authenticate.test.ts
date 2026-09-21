import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { requirePrincipal, requireUser, requireUserId } from './authenticate.js'
import { SESSION_COOKIE_NAME } from './session.js'
import { sessionWithoutSub } from './session.test-helpers.js'

function cookieValue(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string | null {
  return response.cookies.find((cookie) => cookie.name === name)?.value ?? null
}

const DEV_LOGIN_USER_ID = 'dev@piposaude.com.br'
const POLICIES = ['admin/allow/administrate/pipodesk/ticket']

describe('authenticate hook', () => {
  let app: FastifyInstance
  let sessionCookie: string
  const devLoginEnabled = process.env.DEV_LOGIN_ENABLED

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()

    // Routes added before ready(): hooks bind at preReady, so a route that
    // declares no config is covered exactly like an autoloaded one.
    app.get('/__test/protected', async (request) => {
      const principal = requireUser(request)
      return { email: principal.email, policies: principal.policies, sub: principal.sub ?? null }
    })
    app.get('/__test/public', { config: { public: true } }, async () => ({ ok: true }))
    app.get('/__test/needs-user-id', async (request) => ({ userId: requireUserId(request) }))
    app.get('/__test/public-reading-principal', { config: { public: true } }, async (request) =>
      requirePrincipal(request),
    )

    await app.ready()

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: POLICIES },
    })
    sessionCookie = cookieValue(loginResponse, SESSION_COOKIE_NAME)!
  })

  afterAll(async () => {
    await app.close()
    // Assigning undefined back would write the string 'undefined'.
    if (devLoginEnabled === undefined) {
      delete process.env.DEV_LOGIN_ENABLED
    } else {
      process.env.DEV_LOGIN_ENABLED = devLoginEnabled
    }
  })

  it('answers 401 on a route that declares nothing, without a session cookie', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/protected' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'UnauthorizedError',
      message: 'Not authenticated',
    })
  })

  it('puts the session claims on request.principal when the cookie is valid', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      email: DEV_LOGIN_USER_ID,
      policies: POLICIES,
      sub: DEV_LOGIN_USER_ID,
    })
  })

  it('answers 401 when the session cookie was not signed by us', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      cookies: { [SESSION_COOKIE_NAME]: 'forged.jwt.value' },
    })

    expect(response.statusCode).toBe(401)
  })

  it('lets a route through when it declares public', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/public' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })

  it('answers 204 to a browser preflight with no session cookie', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/tickets',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })

    // The only call in the suite that exercises cors ahead of the auth hook.
    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('answers 401, not 500, when a public route asks for a principal', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/public-reading-principal' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'UnauthorizedError',
      message: 'Not authenticated',
    })
  })

  it('hands the sub to a handler that demands a user id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-user-id',
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ userId: DEV_LOGIN_USER_ID })
  })

  it('refuses a session with no sub where a user id is demanded', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-user-id',
      cookies: { [SESSION_COOKIE_NAME]: sessionWithoutSub(app, POLICIES) },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({
      error: 'UnauthorizedError',
      message: 'Invalid session',
    })
  })

  it('lets that same session through where no user id is demanded', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/protected',
      cookies: { [SESSION_COOKIE_NAME]: sessionWithoutSub(app, POLICIES) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      email: DEV_LOGIN_USER_ID,
      policies: POLICIES,
      sub: null,
    })
  })

  it('keeps GET /health public', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
  })

  it('keeps the Google login redirect public', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/google' })

    expect(response.statusCode).toBe(302)
  })

  it('keeps an unknown route at 404 instead of turning it into 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' })

    expect(response.statusCode).toBe(404)
  })

  it('answers 401 on an existing route without a session cookie', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/tickets' })

    expect(response.statusCode).toBe(401)
  })
})
