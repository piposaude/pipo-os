import createQueryClient from 'openapi-react-query'
import type { ApiClient } from './client.js'

export function createApiHooks(client: ApiClient) {
  return createQueryClient(client)
}

export type ApiHooks = ReturnType<typeof createApiHooks>
