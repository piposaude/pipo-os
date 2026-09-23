import { FIXTURE_USER_NAMES, queueSeed, structureFixture } from '@/fixtures/pipodesk/dataset'

export interface ApiCall {
  method: string
  path: string
  body: unknown
}

export interface ApiMock {
  restore: () => void
  calls: ApiCall[]
  failReads: boolean
}

/** Restores by assignment, never `unstubAllGlobals()`: the setup file stubs
 *  `Request`, and unstubbing here would take it down with it. */
export function mockApi(
  routes: Record<string, unknown>,
  writes: Record<string, number> = {},
): ApiMock {
  const original = globalThis.fetch
  const calls: ApiCall[] = []
  const applied = new Map<string, Record<string, unknown>>()
  const mock = { calls, failReads: false } as ApiMock

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const { pathname } = new URL(url, 'http://localhost')

    if (method !== 'GET') {
      const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : null)
      const body = typeof raw === 'string' && raw !== '' ? JSON.parse(raw) : null
      calls.push({ method, path: pathname, body })

      const status = writes[`${method} ${pathname}`] ?? writes[method] ?? 204
      // A write the server accepted has to show up on the next read, or the
      // screen would be tested against a server that forgets.
      if (status === 204) {
        const id = pathname.replace(/^\/api\/tickets\//, '').replace(/\/status$/, '')
        applied.set(id, { ...applied.get(id), ...(body as Record<string, unknown>) })
      }
      return new Response(status === 204 ? null : JSON.stringify({ message: 'recusado' }), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (mock.failReads) {
      return new Response(JSON.stringify({ message: 'indisponível' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (pathname === '/api/tickets/rows' && applied.size > 0) {
      const rows = JSON.parse(
        typeof routes[pathname] === 'string'
          ? (routes[pathname] as string)
          : JSON.stringify(routes[pathname]),
      ) as { data: { id: string }[] }
      rows.data = rows.data.map((row) =>
        applied.has(row.id) ? { ...row, ...applied.get(row.id) } : row,
      )
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const route = routes[pathname]
    const body = typeof route === 'function' ? route(new URL(url, 'http://localhost')) : route
    if (body === undefined) {
      return new Response(JSON.stringify({ message: `sem mock para ${pathname}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof globalThis.fetch

  mock.restore = () => {
    globalThis.fetch = original
  }
  return mock
}

export const page = <T>(data: T[]) => ({ data, total: data.length, page: 1, pageSize: 100 })

const STAMPS = {
  createdBy: 'fixture@piposaude.com.br',
  updatedBy: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

export function fixtureStructureRoutes(viewerId?: string): Record<string, unknown> {
  return {
    '/api/tickets/rows': fixtureRowsRoute(),
    '/api/users': fixtureUsersRoute(),
    '/api/groups': page(
      structureFixture.groups.map((group) => ({
        ...STAMPS,
        id: group.id,
        name: group.name,
        parentId: group.parentId,
        companyIds: group.companyIds,
        members: structureFixture.memberships
          .filter((membership) => membership.groupId === group.id)
          .map((membership) => ({
            userId: membership.userId,
            role: membership.role,
            active: true,
            companyIds: membership.companyIds ?? [],
          })),
      })),
    ),
    '/api/queues': page(
      structureFixture.queues.map((queue) => ({
        ...STAMPS,
        id: queue.id,
        name: queue.name,
        groupId: queue.groupId,
        ownerId: queue.ownerId,
        filters: queue.filter,
        sort: queue.sort,
        groupBy: queue.groupBy ?? null,
        favorite: viewerId ? queue.subscriberIds.includes(viewerId) : false,
      })),
    ),
  }
}

/** Serialized once: the dataset carries some 6.700 rows, and stringifying it
 *  per request would dominate the run. */
let rowsBody: string | null = null

export function fixtureRowsRoute(): string {
  rowsBody ??= JSON.stringify({
    data: queueSeed.map((row) => ({
      ...row,
      title: row.subject,
      displayNumber: row.displayNumber ?? row.id,
      // The projection sends an instant, never a day: noon in São Paulo, so the
      // conversion back lands on the same date the fixture spells out.
      actionDate: row.actionDate === null ? null : `${row.actionDate}T12:00:00-03:00`,
    })),
    total: queueSeed.length,
  })
  return rowsBody
}

export function fixtureUsersRoute(): unknown {
  return {
    data: Object.entries(FIXTURE_USER_NAMES).map(([userId, name]) => ({
      email: userId,
      name,
    })),
  }
}

/** Holds every GET to `path` until `release` runs, so a test can look at the
 *  screen while that read is still in flight. Wraps the API mock, so it has to
 *  come after it — and the mock's own `restore` undoes both. */
export function holdGet(path: string): () => void {
  const inner = globalThis.fetch
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method === 'GET' && new URL(url, 'http://localhost').pathname === path) await released
    return inner(input, init)
  }) as typeof globalThis.fetch

  return release
}
