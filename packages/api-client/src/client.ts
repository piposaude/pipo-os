import createFetchClient, { type Client, type ClientOptions } from 'openapi-fetch'
import type { paths } from './generated/schema.js'

export type ApiClient = Client<paths>

export function createApiClient(options: ClientOptions): ApiClient {
  return createFetchClient<paths>(options)
}
