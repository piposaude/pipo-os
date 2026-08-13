import { createSign, generateKeyPairSync } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from './session.js'

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function signJwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const signature = createSign('SHA256').update(`${header}.${body}`).sign(privateKey)
  return `${header}.${body}.${base64url(signature)}`
}

function buildAccessToken(overrides: Partial<Record<string, unknown>> = {}): string {
  const now = Math.floor(Date.now() / 1000)
  return signJwt({
    iss: 'piposaude.com.br',
    sub: 'pikachu@piposaude.com.br',
    email: 'pikachu@piposaude.com.br',
    iat: now,
    exp: now + 28800,
    policies: ['admin/allow/administrate/ticket/*'],
    ...overrides,
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// light-my-request's `cookies` inject option re-encodes whatever value it's
// given (it assumes a decoded value, like a browser's cookie jar would hold),
// so callers must read `response.cookies` (already decoded) rather than the
// raw Set-Cookie header — using the raw header double-encodes signed cookies
// and breaks the signature check on the next request.
function cookieValue(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string | null {
  return response.cookies.find((cookie) => cookie.name === name)?.value ?? null
}

async function startLogin(
  app: FastifyInstance,
  redirect?: string,
): Promise<{ state: string; stateCookie: string }> {
  const response = await app.inject({
    method: 'GET',
    url: redirect
      ? `/api/auth/google?redirect=${encodeURIComponent(redirect)}`
      : '/api/auth/google',
  })
  const location = new URL(response.headers.location as string)
  return {
    state: location.searchParams.get('state')!,
    stateCookie: cookieValue(response, 'pipo_os_oauth_state')!,
  }
}

describe('auth routes', () => {
  let app: FastifyInstance
  const fetchMock = vi.fn()

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('GET /api/auth/google', () => {
    it('redirects to Google with a state cookie set', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/auth/google' })

      expect(response.statusCode).toBe(302)
      const location = new URL(response.headers.location as string)
      expect(location.origin).toBe('https://accounts.google.com')
      expect(location.pathname).toBe('/o/oauth2/v2/auth')
      expect(location.searchParams.get('response_type')).toBe('code')
      expect(location.searchParams.get('state')).toBeTruthy()
      expect(cookieValue(response, 'pipo_os_oauth_state')).toBeTruthy()
    })

    it('rejects an unsafe redirect target and falls back to the default', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google?redirect=//evil.example.com',
      })

      expect(response.statusCode).toBe(302)
      expect(cookieValue(response, 'pipo_os_oauth_state')).toBeTruthy()
    })
  })

  describe('GET /api/auth/google/callback', () => {
    it('exchanges the code, sets a signed session cookie and redirects back', async () => {
      const { state, stateCookie } = await startLogin(app, '/tickets')
      const accessToken = buildAccessToken()
      fetchMock.mockResolvedValueOnce(jsonResponse({ 'access-token': accessToken }))

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/google/callback?code=abc123&state=${state}`,
        cookies: { pipo_os_oauth_state: stateCookie },
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('/tickets')
      expect(cookieValue(response, SESSION_COOKIE_NAME)).toBeTruthy()

      const [url, options] = fetchMock.mock.calls[0]
      expect(url).toMatch(/\/v1\/google-tools-login$/)
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body)).toMatchObject({ authcode: 'abc123' })
    })

    it('redirects to /login with invalid_state when the state does not match', async () => {
      const { stateCookie } = await startLogin(app)

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/google/callback?code=abc123&state=tampered',
        cookies: { pipo_os_oauth_state: stateCookie },
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe('/login?error=invalid_state')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('redirects to /login with access_denied when Google reports an error', async () => {
      const { state, stateCookie } = await startLogin(app)

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/google/callback?error=access_denied&state=${state}`,
        cookies: { pipo_os_oauth_state: stateCookie },
      })

      expect(response.headers.location).toBe('/login?error=access_denied')
    })

    it('redirects to /login with identity_not_found when the auth-service returns 404', async () => {
      const { state, stateCookie } = await startLogin(app)
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Identity not found!' }, 404))

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/google/callback?code=abc123&state=${state}`,
        cookies: { pipo_os_oauth_state: stateCookie },
      })

      expect(response.headers.location).toBe('/login?error=identity_not_found')
    })

    it('redirects to /login with domain_not_allowed for an email outside the allowed domains', async () => {
      const { state, stateCookie } = await startLogin(app)
      const accessToken = buildAccessToken({ email: 'someone@gmail.com', sub: 'someone@gmail.com' })
      fetchMock.mockResolvedValueOnce(jsonResponse({ 'access-token': accessToken }))

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/google/callback?code=abc123&state=${state}`,
        cookies: { pipo_os_oauth_state: stateCookie },
      })

      expect(response.headers.location).toBe('/login?error=domain_not_allowed')
      expect(cookieValue(response, SESSION_COOKIE_NAME)).toBeNull()
    })

    it('accepts an email from the secondary allowed domain', async () => {
      const { state, stateCookie } = await startLogin(app)
      const accessToken = buildAccessToken({ email: 'pikachu@pipo.ai', sub: 'pikachu@pipo.ai' })
      fetchMock.mockResolvedValueOnce(jsonResponse({ 'access-token': accessToken }))

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/google/callback?code=abc123&state=${state}`,
        cookies: { pipo_os_oauth_state: stateCookie },
      })

      expect(response.headers.location).toBe('/')
      expect(cookieValue(response, SESSION_COOKIE_NAME)).toBeTruthy()
    })

    it('redirects to /login with auth_service_unavailable when the exchange fails', async () => {
      const { state, stateCookie } = await startLogin(app)
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/google/callback?code=abc123&state=${state}`,
        cookies: { pipo_os_oauth_state: stateCookie },
      })

      expect(response.headers.location).toBe('/login?error=auth_service_unavailable')
    })

    it('redirects to /login with invalid_token when the auth-service returns an already-expired token', async () => {
      const { state, stateCookie } = await startLogin(app)
      const expiredToken = buildAccessToken({ exp: Math.floor(Date.now() / 1000) - 10 })
      fetchMock.mockResolvedValueOnce(jsonResponse({ 'access-token': expiredToken }))

      const response = await app.inject({
        method: 'GET',
        url: `/api/auth/google/callback?code=abc123&state=${state}`,
        cookies: { pipo_os_oauth_state: stateCookie },
      })

      expect(response.headers.location).toBe('/login?error=invalid_token')
      expect(cookieValue(response, SESSION_COOKIE_NAME)).toBeNull()
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns 401 when there is no session cookie', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/auth/me' })

      expect(response.statusCode).toBe(401)
      expect(response.json().error).toBe('UnauthorizedError')
    })

    it('returns 401 when the session cookie is forged (not signed by us)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { [SESSION_COOKIE_NAME]: buildAccessToken() },
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns the session claims for a valid signed session cookie', async () => {
      const { state, stateCookie } = await startLogin(app)
      const accessToken = buildAccessToken({
        email: 'pikachu@piposaude.com.br',
        policies: ['admin/allow/administrate/ticket/*'],
      })
      fetchMock.mockResolvedValueOnce(jsonResponse({ 'access-token': accessToken }))

      const callbackResponse = await app.inject({
        method: 'GET',
        url: `/api/auth/google/callback?code=abc123&state=${state}`,
        cookies: { pipo_os_oauth_state: stateCookie },
      })
      const sessionCookie = cookieValue(callbackResponse, SESSION_COOKIE_NAME)!

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        email: 'pikachu@piposaude.com.br',
        policies: ['admin/allow/administrate/ticket/*'],
      })
    })
  })

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { [SESSION_COOKIE_NAME]: 'anything' },
      })

      expect(response.statusCode).toBe(204)
      const setCookie = response.headers['set-cookie'] as string
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=;`)
    })
  })
})
