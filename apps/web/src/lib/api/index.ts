// Barrel of the app's entire server surface: the typed client plus the
// TanStack Query hooks generated from the OpenAPI contract.
import { createApiHooks } from '@pipo-os/api-client'
import { client } from './client'

export const api = createApiHooks(client)

export { client } from './client'
export { ApiError } from './errors'
