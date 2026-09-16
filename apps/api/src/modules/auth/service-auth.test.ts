import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import { requirePrincipal, requireUser } from './authenticate.js'
import { jsonResponse } from '../../shared/json.test-helpers.js'

const TICKET = { domain: 'pipodesk', specific: 'ticket' }
const TICKET_POLICY = 'admin/allow/administrate/pipodesk/ticket'
const IDENTITY_ID = '3f1a6d6e-9c1e-4f0b-9d0e-2b7a1c5f8e42'
const SERVICE_NAME_IN_TEST = 'enrollment-integrations-worker'
const SERVICE_NAMESPACE = 'cronjobs'

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

/** Shaped like the projected token Kubernetes mounts in every pod: the service
 *  account name lives under the `kubernetes.io` claim, and `sub` repeats it as
 *  `system:serviceaccount:<namespace>:<name>`. Nothing here is signed — the
 *  auth-service is what validates the token, and it is stubbed in these tests. */
function serviceAccountToken(
  name: string,
  expiresInSeconds = 3600,
  namespace = SERVICE_NAMESPACE,
): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: 'https://oidc.eks.sa-east-1.amazonaws.com/id/PIPO',
      sub: `system:serviceaccount:${namespace}:${name}`,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      'kubernetes.io': { namespace, serviceaccount: { name } },
    }),
  )
  return `${header}.${payload}.not-a-signature`
}

describe('a service calling the API', () => {
  let app: FastifyInstance
  const fetchMock = vi.fn()
  const eiToken = serviceAccountToken(SERVICE_NAME_IN_TEST)

  beforeAll(async () => {
    process.env.SERVICE_ALLOWED_ACCOUNTS = `${SERVICE_NAMESPACE}/${SERVICE_NAME_IN_TEST}`
    app = buildApp()

    // On the root instance, where the onRequest hook treats them like any
    // autoloaded route. The onRoute hook does not see them — which is why the
    // boot test at the end of this file builds its own app.
    app.get(
      '/__test/open-to-service',
      { config: { serviceAllowed: true, policy: TICKET } },
      async (request) => ({ principal: requirePrincipal(request) }),
    )
    app.get('/__test/people-only', async () => ({ ok: true }))
    app.get(
      '/__test/reads-the-person',
      { config: { serviceAllowed: true, policy: TICKET } },
      async (request) => ({ email: requireUser(request).email }),
    )

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    delete process.env.SERVICE_ALLOWED_ACCOUNTS
  })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gets in with the service account token of an allowed service', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ 'identity-id': IDENTITY_ID }))

    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${eiToken}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().principal).toEqual({
      kind: 'service',
      name: 'enrollment-integrations-worker',
      identityId: IDENTITY_ID,
      policies: [TICKET_POLICY],
    })
  })

  it('asks the auth-service for the ticket policy, not just for the identity', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ 'identity-id': IDENTITY_ID }))

    await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${eiToken}` },
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://auth-service.platform:4000/api/verify-token')
    expect(JSON.parse(options.body).policies).toEqual([TICKET_POLICY])
  })

  // The route inventory is the fence, and it closes before the network: a route
  // that never opened itself to a service must not even be looked up upstream.
  it('is refused on a route that does not open itself to a service', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/people-only',
      headers: { authorization: `Bearer ${eiToken}` },
    })

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // RFC 7235 §2.1: the scheme name is case-insensitive.
  it('accepts the authorization scheme in any case', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ 'identity-id': IDENTITY_ID }))

    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `bearer ${eiToken}` },
    })

    expect(response.statusCode).toBe(200)
  })

  // A 307/308 replays the body, token included, at the Location it names.
  it('does not follow a redirect while carrying the token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ 'identity-id': IDENTITY_ID }))

    await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${eiToken}` },
    })

    expect(fetchMock.mock.calls[0][1].redirect).toBe('error')
  })

  // The auth-service resolves the identity by name alone, so the namespace is
  // a fence only this allowlist can hold.
  it('is refused when the name matches but the namespace does not', async () => {
    const homonym = serviceAccountToken(SERVICE_NAME_IN_TEST, 3600, 'default')

    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${homonym}` },
    })

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 401 when the token names no namespace at all', async () => {
    const noNamespace = `${base64url(JSON.stringify({ alg: 'RS256' }))}.${base64url(
      JSON.stringify({
        exp: Math.floor(Date.now() / 1000) + 3600,
        'kubernetes.io': { serviceaccount: { name: SERVICE_NAME_IN_TEST } },
      }),
    )}.x`

    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${noNamespace}` },
    })

    expect(response.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is refused when the service is not in the allowlist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${serviceAccountToken('some-other-service')}` },
    })

    expect(response.statusCode).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is refused when the auth-service does not know the identity', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 403))

    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${eiToken}` },
    })

    expect(response.statusCode).toBe(403)
  })

  it('is refused when the auth-service rejects the token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid credentials' }, 401))

    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${eiToken}` },
    })

    expect(response.statusCode).toBe(401)
  })

  it('answers 503 when the auth-service is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${eiToken}` },
    })

    expect(response.statusCode).toBe(503)
  })

  it('answers 401 when a token carries no service account name', async () => {
    const userShapedToken = `${base64url(JSON.stringify({ alg: 'none' }))}.${base64url(
      JSON.stringify({ sub: 'pikachu@piposaude.com.br' }),
    )}.x`

    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${userShapedToken}` },
    })

    expect(response.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still answers 401 to a caller with neither cookie nor bearer', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/open-to-service' })

    expect(response.statusCode).toBe(401)
  })

  // Reading a service's e-mail would answer undefined instead of refusing.
  it('is refused by a handler that needs a person, even holding the policy', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ 'identity-id': IDENTITY_ID }))

    const response = await app.inject({
      method: 'GET',
      url: '/__test/reads-the-person',
      headers: { authorization: `Bearer ${eiToken}` },
    })

    expect(response.statusCode).toBe(403)
  })

  // Reading the deadline first keeps a forged token from costing a round trip.
  it('does not call the auth-service for a token that is already expired', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${serviceAccountToken(SERVICE_NAME_IN_TEST, -60)}` },
    })

    expect(response.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not call the auth-service for a token with no expiry at all', async () => {
    const noExpiry = `${base64url(JSON.stringify({ alg: 'RS256' }))}.${base64url(
      JSON.stringify({
        'kubernetes.io': {
          namespace: SERVICE_NAMESPACE,
          serviceaccount: { name: SERVICE_NAME_IN_TEST },
        },
      }),
    )}.x`

    const response = await app.inject({
      method: 'GET',
      url: '/__test/open-to-service',
      headers: { authorization: `Bearer ${noExpiry}` },
    })

    expect(response.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  // Inside a plugin, which is where the module routes live: the onRoute hook
  // only sees what is registered after it, and it loads with the plugins.
  it('refuses to boot a route that accepts a service without naming a policy', async () => {
    const unguarded = buildApp()
    unguarded.register(async (scope) => {
      scope.get('/__test/no-policy', { config: { serviceAllowed: true } }, async () => ({
        ok: true,
      }))
    })

    // By hand, not with rejects: an app whose boot failed throws again when the
    // assertion helper inspects it.
    let caught: unknown
    try {
      await unguarded.ready()
    } catch (error) {
      caught = error
    } finally {
      await unguarded.close().catch(() => {})
    }

    expect((caught as Error | undefined)?.message).toMatch(
      /accepts a service but declares no policy/,
    )
  })

  // An empty array is a `policy` config too, and it reaches verify-token as no
  // requirement at all — the exact hole the guard above exists to close.
  it('refuses to boot a route whose policy is an empty array', async () => {
    const unguarded = buildApp()
    unguarded.register(async (scope) => {
      scope.get(
        '/__test/empty-policy',
        { config: { serviceAllowed: true, policy: [] } },
        async () => ({
          ok: true,
        }),
      )
    })

    let caught: unknown
    try {
      await unguarded.ready()
    } catch (error) {
      caught = error
    } finally {
      await unguarded.close().catch(() => {})
    }

    expect((caught as Error | undefined)?.message).toMatch(
      /accepts a service but declares no policy/,
    )
  })
})
