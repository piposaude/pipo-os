import type { AuthConfig } from './config.js'

export class IdentityNotFoundError extends Error {
  constructor() {
    super('Identity not found in the auth service')
    this.name = 'IdentityNotFoundError'
  }
}

interface GoogleToolsLoginResponse {
  'access-token'?: unknown
}

// exchangeCode runs on the request path of GET /api/auth/google/callback: an
// unbounded fetch would hold that request open for as long as the
// auth-service is hung, which piles up during an incident. The abort maps to
// the generic catch in routes.ts (auth_service_unavailable), same as any
// other exchange failure.
const EXCHANGE_TIMEOUT_MS = 10_000

// Wraps the auth-service's /v1/google-tools-login contract: the API receives
// an OAuth2 authorization code (never the Google credential/id_token itself)
// and the auth-service performs the code exchange server-side, reusing the
// Backoffice client already registered in the Google Cloud console.
export class AuthService {
  constructor(private readonly config: AuthConfig) {}

  get callbackUrl(): string {
    return `${this.config.appBaseUrl}/api/auth/google/callback`
  }

  buildAuthorizeUrl(state: string): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', this.config.googleClientId)
    url.searchParams.set('redirect_uri', this.callbackUrl)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'openid email profile')
    url.searchParams.set('prompt', 'select_account')
    url.searchParams.set('state', state)
    return url.toString()
  }

  async exchangeCode(authcode: string): Promise<string> {
    const response = await fetch(`${this.config.authServiceUrl}/v1/google-tools-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authcode, 'redirect-uri': this.callbackUrl }),
      signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
    })

    if (response.status === 404) {
      throw new IdentityNotFoundError()
    }

    if (!response.ok) {
      throw new Error(`auth-service google-tools-login failed with status ${response.status}`)
    }

    const data = (await response.json()) as GoogleToolsLoginResponse
    const accessToken = data['access-token']

    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error('auth-service response is missing access-token')
    }

    return accessToken
  }
}
