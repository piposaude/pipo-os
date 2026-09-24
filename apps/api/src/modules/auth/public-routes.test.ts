import type { FastifyInstance, RouteOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'

// The hook test proves a route without `public` is protected; this pins down the
// list of routes that do carry it.
describe('the set of public routes', () => {
  let app: FastifyInstance
  const registered: RouteOptions[] = []
  const publicRoutes: string[] = []
  const devLoginEnabled = process.env.DEV_LOGIN_ENABLED

  beforeAll(async () => {
    // The dev-login route also declares public, but it only exists when the env
    // var turns it on — this list is the one a deployed environment gets.
    delete process.env.DEV_LOGIN_ENABLED
    app = buildApp()

    // Only what boots at ready() reaches this hook — the whole autoload tree,
    // where a new route is born. Routes buildApp adds directly are already
    // registered by now, so the inventory test below is what covers them.
    app.addHook('onRoute', (route) => {
      registered.push(route)
    })

    await app.ready()

    // Read after ready(), not inside the hook: a route can be stamped public by
    // an onRoute of its own scope, which runs later than this one.
    for (const route of registered) {
      if (route.config?.public !== true) {
        continue
      }
      const methods = Array.isArray(route.method) ? route.method : [route.method]
      for (const method of methods) {
        publicRoutes.push(`${method} ${route.url}`)
      }
    }
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

  it('is exactly the routes that must answer before a session exists', () => {
    expect([...publicRoutes].sort()).toEqual([
      'GET /api/auth/google',
      'GET /api/auth/google/callback',
      'HEAD /api/auth/google',
      'HEAD /api/auth/google/callback',
      'POST /api/auth/logout',
    ])
  })

  // The snapshot above reads `config` off the routes this hook saw, and a route
  // buildApp registers directly never reaches it — /health is public and does
  // not appear there. So the list alone cannot say "these are all of them".
  // This pins the whole inventory instead: any route added anywhere turns it
  // red, and whoever added it has to state its side here.
  it('serves no route beyond the ones whose side is already stated', () => {
    expect(app.printRoutes({ commonPrefix: false })).toBe(
      `├── /health (GET, HEAD)
├── /api/auth/google (GET, HEAD)
│   └── /callback (GET, HEAD)
├── /api/auth/me (GET, HEAD)
├── /api/auth/logout (POST)
├── /api/tickets (GET, HEAD, POST)
│   ├── /rows (GET, HEAD)
│   ├── /inbox (GET, HEAD)
│   └── /:id (GET, HEAD, PATCH)
│       ├── /comments (GET, HEAD, POST)
│       ├── /claim (POST)
│       ├── /timeline (GET, HEAD)
│       └── /status (PATCH)
├── /api/groups (POST, GET, HEAD)
│   └── /:id (GET, HEAD, PATCH, DELETE)
│       ├── /companies (PUT)
│       │   └── /:companyId (POST)
│       └── /members (POST)
│           └── /:memberId (DELETE, PATCH)
├── /api/queues (POST, GET, HEAD)
│   ├── /counts (GET, HEAD)
│   └── /:id (GET, HEAD, PATCH, DELETE)
│       ├── /favorite (POST, DELETE)
│       └── /tickets (GET, HEAD)
├── /api/users (GET, HEAD)
└── * (OPTIONS)
`,
    )
  })

  // /health is the one public route the snapshot above cannot see, so its side
  // is asserted by behaviour instead of by config.
  it('keeps /health answering without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).not.toBe(401)
  })
})
