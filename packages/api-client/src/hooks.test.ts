import { describe, expect, it } from 'vitest'
import { createApiClient } from './client.js'
import { createApiHooks } from './hooks.js'

describe('createApiHooks', () => {
  it('exposes the react-query integration with a stable query key shape', () => {
    const client = createApiClient({ baseUrl: 'http://localhost:3001' })
    const api = createApiHooks(client)

    const init = { params: { path: { id: '00000000-0000-4000-8000-000000000001' } } }
    expect(api.queryOptions('get', '/api/tickets/{id}', init).queryKey).toEqual([
      'get',
      '/api/tickets/{id}',
      init,
    ])
    expect(typeof api.useQuery).toBe('function')
    expect(typeof api.useMutation).toBe('function')
  })
})
