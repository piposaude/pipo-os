import { createApiClient, createApiHooks } from '@pipo-os/api-client'

const client = createApiClient({ baseUrl: '' })

export const api = createApiHooks(client)
