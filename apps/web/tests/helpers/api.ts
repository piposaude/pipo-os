import { structureFixture } from '@/fixtures/pipodesk/dataset'

/** Restores by assignment, never `unstubAllGlobals()`: the setup file stubs
 *  `Request`, and unstubbing here would take it down with it. */
export function mockApi(routes: Record<string, unknown>): () => void {
  const original = globalThis.fetch

  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const { pathname } = new URL(url, 'http://localhost')
    const body = routes[pathname]

    if (body === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ message: `sem mock para ${pathname}` }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }) as typeof globalThis.fetch

  return () => {
    globalThis.fetch = original
  }
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
