import { createApiClient } from '@pipo-os/api-client'
import { ApiError, type ApiErrorDetail } from './errors'

const isDetail = (value: unknown): value is ApiErrorDetail =>
  typeof value === 'object' &&
  value !== null &&
  'field' in value &&
  typeof value.field === 'string' &&
  'code' in value &&
  typeof value.code === 'string'

// Central HTTP wrapper: the single point for base URL, auth headers and error
// normalization. Every server call goes through this client — inline fetch()
// anywhere else in the app is forbidden.
const baseUrl = import.meta.env.VITE_API_URL ?? ''

export const client = createApiClient({
  baseUrl,
  // Resolve fetch lazily so tests and stories can stub globalThis.fetch after
  // this module is evaluated.
  fetch: (request) => globalThis.fetch(request),
})

client.use({
  // The login issue plugs the Authorization header here (onRequest), keeping
  // this file as the app's single point of auth.
  async onResponse({ response }) {
    if (response.ok) {
      return response
    }
    let message = response.statusText
    let details: ApiErrorDetail[] = []
    try {
      const body: unknown = await response.clone().json()
      if (typeof body === 'object' && body !== null) {
        if ('message' in body && typeof body.message === 'string') message = body.message
        if ('details' in body && Array.isArray(body.details))
          details = body.details.filter(isDetail)
      }
    } catch {
      // Non-JSON error body — keep the status text.
    }
    throw new ApiError(response.status, message, details)
  },
})
