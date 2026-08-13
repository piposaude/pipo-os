export { createApiClient } from './client.js'
export type { ApiClient } from './client.js'
export { createApiHooks } from './hooks.js'
export type { ApiHooks } from './hooks.js'
export type { components, paths } from './generated/schema.js'

import type { components } from './generated/schema.js'

export type Ticket = components['schemas']['Ticket']
export type TicketStatus = components['schemas']['TicketStatus']
export type AuthMe = components['schemas']['AuthMe']
