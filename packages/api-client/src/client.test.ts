import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from './client.js'

describe('createApiClient', () => {
  it('sends requests to baseUrl using the injected fetch', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      expect(request).toBeInstanceOf(Request)
      return new Response(
        JSON.stringify({
          id: '00000000-0000-4000-8000-000000000001',
          enrollmentId: '00000000-0000-4000-8000-000000000002',
          enrollmentType: 'inclusion',
          status: 'broker-processing',
          queueId: null,
          assigneeId: null,
          companyId: '00000000-0000-4000-8000-000000000003',
          tags: [],
          forceCompletion: false,
          enrollmentSnapshot: {},
          sourceSystem: 'enrollment-integrations',
          parentTicketId: null,
          closedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })

    const client = createApiClient({ baseUrl: 'http://localhost:3001', fetch: fetchMock })
    const { data, error } = await client.GET('/api/tickets/{id}', {
      params: { path: { id: '00000000-0000-4000-8000-000000000001' } },
    })

    expect(error).toBeUndefined()
    expect(data?.id).toBe('00000000-0000-4000-8000-000000000001')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [request] = fetchMock.mock.calls[0]
    expect(request.url).toBe(
      'http://localhost:3001/api/tickets/00000000-0000-4000-8000-000000000001',
    )
    expect(request.method).toBe('GET')
  })

  it('propagates a non-2xx response as a typed error instead of throwing', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'NotFoundError', message: 'Ticket not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    )

    const client = createApiClient({ baseUrl: 'http://localhost:3001', fetch: fetchMock })
    const { data, error, response } = await client.GET('/api/tickets/{id}', {
      params: { path: { id: '00000000-0000-4000-8000-000000000099' } },
    })

    expect(data).toBeUndefined()
    expect(response.status).toBe(404)
    expect(error).toEqual({ error: 'NotFoundError', message: 'Ticket not found' })
  })
})
