import type { FastifyInstance, RouteOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import type { PolicyRequirement } from './policy.js'
import { SESSION_COOKIE_NAME } from './session.js'

function cookieValue(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string | null {
  return response.cookies.find((cookie) => cookie.name === name)?.value ?? null
}

const PIPODESK_TICKET_POLICY_STRING = 'admin/allow/administrate/pipodesk/ticket'
// The policy the ticket-service (squad opex) uses for its own admin role. It is
// not ours, and holding it must not open a single route here.
const TICKET_SERVICE_POLICY_STRING = 'admin/allow/administrate/ticket/*'

async function session(app: FastifyInstance, policies: string[]): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/dev-login',
    payload: { policies },
  })
  return cookieValue(response, SESSION_COOKIE_NAME)!
}

describe('the policy hook', () => {
  let app: FastifyInstance
  let withPolicy: string
  let withoutPolicy: string
  let withAnotherDomain: string
  let withTicketServicePolicy: string
  let withHouseWideAccess: string
  let withDeniedTicket: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()

    // Added before ready(), the same way the auth hook is exercised: hooks bind
    // at preReady, so these routes are covered exactly like an autoloaded one.
    app.get(
      '/__test/needs-ticket',
      { config: { policy: { domain: 'pipodesk', specific: 'ticket' } } },
      async () => ({
        ok: true,
      }),
    )
    app.get('/__test/needs-nothing', async () => ({ ok: true }))
    app.get('/__test/open', { config: { public: true } }, async () => ({ ok: true }))
    app.get(
      '/__test/contradictory-at-root',
      { config: { public: true, policy: { domain: 'pipodesk', specific: 'ticket' } } },
      async () => ({ ok: true }),
    )

    await app.ready()

    withPolicy = await session(app, [PIPODESK_TICKET_POLICY_STRING])
    withoutPolicy = await session(app, [])
    withAnotherDomain = await session(app, ['admin/allow/administrate/company/*'])
    withTicketServicePolicy = await session(app, [TICKET_SERVICE_POLICY_STRING])
    withHouseWideAccess = await session(app, ['admin/allow/*/*'])
    withDeniedTicket = await session(app, [
      'admin/allow/administrate/pipodesk/*',
      'admin/deny/administrate/pipodesk/ticket',
    ])
  })

  afterAll(async () => {
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  it('lets through the session that holds the policy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-ticket',
      cookies: { [SESSION_COOKIE_NAME]: withPolicy },
    })

    expect(response.statusCode).toBe(200)
  })

  // Total access in Pipo is a four-part policy. Requiring the same length would
  // answer 403 to every admin of the house.
  it('lets through the house-wide policy, which is shorter than the requirement', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-ticket',
      cookies: { [SESSION_COOKIE_NAME]: withHouseWideAccess },
    })

    expect(response.statusCode).toBe(200)
  })

  it('answers 403 to a session denied the policy, however wide its allow', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-ticket',
      cookies: { [SESSION_COOKIE_NAME]: withDeniedTicket },
    })

    expect(response.statusCode).toBe(403)
  })

  it('answers 403 when the session carries no policy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-ticket',
      cookies: { [SESSION_COOKIE_NAME]: withoutPolicy },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({
      error: 'ForbiddenError',
      message: `Missing policy ${PIPODESK_TICKET_POLICY_STRING}`,
    })
  })

  // The domain is `pipodesk`, not `ticket`, because `ticket` already belongs to
  // the ticket-service. If someone renames it back, this is what goes red.
  it('answers 403 to the policy of the ticket-service, which is another product', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-ticket',
      cookies: { [SESSION_COOKIE_NAME]: withTicketServicePolicy },
    })

    expect(response.statusCode).toBe(403)
  })

  it('answers 403 when the session only holds another domain', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-ticket',
      cookies: { [SESSION_COOKIE_NAME]: withAnotherDomain },
    })

    expect(response.statusCode).toBe(403)
  })

  // Identity comes first: telling an anonymous caller which policy it lacks
  // would answer a question it has not earned the right to ask.
  it('answers 401, not 403, when there is no session at all', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/needs-ticket' })

    expect(response.statusCode).toBe(401)
  })

  it('leaves a route that declares no policy to the session alone', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/needs-nothing',
      cookies: { [SESSION_COOKIE_NAME]: withoutPolicy },
    })

    expect(response.statusCode).toBe(200)
  })

  it('leaves a public route alone', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/open' })

    expect(response.statusCode).toBe(200)
  })

  // The boot guard cannot see a route registered on the root instance, before
  // this plugin's onRoute. When the contradiction slips through, the route closes
  // for everyone — a public route never gets a principal, so no policy can be
  // held — instead of publishing itself as open.
  it('closes a route that declares public alongside a policy, for every session', async () => {
    for (const cookie of [withoutPolicy, withPolicy]) {
      const response = await app.inject({
        method: 'GET',
        url: '/__test/contradictory-at-root',
        cookies: { [SESSION_COOKIE_NAME]: cookie },
      })

      expect(response.statusCode).toBe(403)
    }
  })

  it('keeps an unknown route at 404 instead of turning it into 403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/__test/nowhere',
      cookies: { [SESSION_COOKIE_NAME]: withoutPolicy },
    })

    expect(response.statusCode).toBe(404)
  })

  // Inside a plugin, which is where the module routes live: the onRoute hook
  // only sees what is registered after it, and it loads with the plugins.
  it('refuses to boot a route that declares both public and a policy', async () => {
    const contradictory = buildApp()
    contradictory.register(async (scope) => {
      scope.get(
        '/__test/contradictory',
        { config: { public: true, policy: { domain: 'pipodesk', specific: 'ticket' } } },
        async () => ({ ok: true }),
      )
    })

    // Caught by hand, not with rejects: an app whose boot failed throws again
    // when the assertion helper inspects it.
    let caught: unknown
    try {
      await contradictory.ready()
    } catch (error) {
      caught = error
    } finally {
      // The failed boot may still have opened the pool dbPlugin closes on close.
      await contradictory.close().catch(() => {})
    }

    expect((caught as Error | undefined)?.message).toMatch(/declares both public and a policy/)
  })
})

// The inventory of which routes stand behind a policy. A route added without
// deciding its side lands here as null and turns this red. The nulls left are
// the session's own routes, which ask for a session and not a permission.
describe('the policy each route requires', () => {
  const TICKET = { domain: 'pipodesk', specific: 'ticket' }
  const STRUCTURE = { domain: 'pipodesk', specific: 'structure' }

  // With the flag on, buildApp registers dev-login, which EXPECTED does not list.
  const flag = process.env.DEV_LOGIN_ENABLED
  const registered: RouteOptions[] = []
  let inventoried: FastifyInstance | undefined

  beforeAll(async () => {
    delete process.env.DEV_LOGIN_ENABLED
    inventoried = buildApp()
    inventoried.addHook('onRoute', (route) => {
      registered.push(route)
    })
    // The final config value is only there after ready(): a route stamped by a
    // scope of its own, like the docs, has nothing on it before that.
    await inventoried.ready()
  })

  afterAll(async () => {
    if (flag !== undefined) {
      process.env.DEV_LOGIN_ENABLED = flag
    }
    // Otherwise the pool dbPlugin opened stays behind.
    await inventoried?.close().catch(() => {})
  })

  const apiRoutes = () =>
    registered
      .flatMap((route) => {
        const methods = Array.isArray(route.method) ? route.method : [route.method]
        return methods.map((method) => ({
          method,
          url: route.url,
          config: route.config,
          schema: route.schema,
        }))
      })
      .filter(
        ({ method, url }) => url.startsWith('/api') && method !== 'HEAD' && method !== 'OPTIONS',
      )

  const EXPECTED: Array<[string, PolicyRequirement | PolicyRequirement[] | null]> = [
    ['DELETE /api/groups/:id', STRUCTURE],
    ['DELETE /api/groups/:id/members/:memberId', STRUCTURE],
    ['DELETE /api/queues/:id', [TICKET, STRUCTURE]],
    ['DELETE /api/queues/:id/favorite', [TICKET, STRUCTURE]],
    ['GET /api/auth/google', null],
    ['GET /api/auth/google/callback', null],
    ['GET /api/auth/me', null],
    ['GET /api/groups', STRUCTURE],
    ['GET /api/groups/:id', STRUCTURE],
    ['GET /api/queues', [TICKET, STRUCTURE]],
    ['GET /api/queues/:id', [TICKET, STRUCTURE]],
    ['GET /api/queues/:id/tickets', TICKET],
    ['GET /api/queues/counts', [TICKET, STRUCTURE]],
    ['GET /api/tickets', TICKET],
    ['GET /api/tickets/:id', TICKET],
    ['GET /api/tickets/:id/comments', TICKET],
    ['GET /api/tickets/:id/timeline', TICKET],
    ['GET /api/tickets/rows', TICKET],
    ['GET /api/users', [TICKET, STRUCTURE]],
    ['PATCH /api/groups/:id', STRUCTURE],
    ['PATCH /api/groups/:id/members/:memberId', STRUCTURE],
    ['PATCH /api/queues/:id', [TICKET, STRUCTURE]],
    ['PATCH /api/tickets/:id', TICKET],
    ['PATCH /api/tickets/:id/status', TICKET],
    ['POST /api/auth/logout', null],
    ['POST /api/groups', STRUCTURE],
    ['POST /api/groups/:id/members', STRUCTURE],
    ['POST /api/queues', [TICKET, STRUCTURE]],
    ['POST /api/queues/:id/favorite', [TICKET, STRUCTURE]],
    ['POST /api/tickets', TICKET],
    ['POST /api/tickets/:id/claim', TICKET],
    ['POST /api/tickets/:id/comments', TICKET],
    ['PUT /api/groups/:id/companies', STRUCTURE],
  ]

  it('is exactly the routes whose side is already stated', () => {
    const inventory = apiRoutes()
      .map(({ method, url, config }): [string, PolicyRequirement | PolicyRequirement[] | null] => [
        `${method} ${url}`,
        config?.policy ?? null,
      ])
      .sort(([a], [b]) => a.localeCompare(b))

    expect(inventory).toEqual(EXPECTED)
  })

  // The hook answers 403 either way; a route missing it ships a contract, and a
  // generated client, that do not know the route can refuse.
  it('declares the 403 on every route it closes', () => {
    const missing = apiRoutes()
      .filter(({ config }) => config?.policy !== undefined)
      .filter(
        ({ schema }) =>
          (schema?.response as Record<string, unknown> | undefined)?.['403'] === undefined,
      )
      .map(({ method, url }) => `${method} ${url}`)
      .sort()

    expect(missing).toEqual([])
  })
})
