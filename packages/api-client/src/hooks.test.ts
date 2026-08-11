import { describe, expect, it } from 'vitest'
import { createApiClient } from './client.js'
import { createApiHooks } from './hooks.js'

describe('createApiHooks', () => {
  it('exposes the react-query integration with a stable query key shape', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3001' })
    const api = createApiHooks(client)

    expect(api.queryOptions('get', '/api/tickets').queryKey).toEqual(['get', '/api/tickets'])
    expect(typeof api.useQuery).toBe('function')
    expect(typeof api.useMutation).toBe('function')
  })
})
