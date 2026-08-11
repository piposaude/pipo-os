import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from './client.js'

describe('createApiClient', () => {
  it('sends requests to baseUrl using the injected fetch', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      expect(request).toBeInstanceOf(Request)
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const client = createApiClient({ baseUrl: 'http://localhost:3001', fetch: fetchMock })
    const { data, error } = await client.GET('/api/tickets')

    expect(error).toBeUndefined()
    expect(data).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [request] = fetchMock.mock.calls[0]
    expect(request.url).toBe('http://localhost:3001/api/tickets')
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
    const { data, error, response } = await client.PUT('/api/tickets/{id}', {
      params: { path: { id: '00000000-0000-0000-0000-000000000000' } },
      body: { status: 'closed' },
    })

    expect(data).toBeUndefined()
    expect(response.status).toBe(404)
    expect(error).toEqual({ error: 'NotFoundError', message: 'Ticket not found' })
  })
})
