import { appEnv, isDeployedEnvironment } from '../../shared/environment.js'
export interface AuthConfig {
  authServiceUrl: string
  authServiceInternalUrl: string
  googleClientId: string
  appBaseUrl: string
  allowedEmailDomains: string[]
  isDeployed: boolean
  devLoginEnabled: boolean
  devLoginEmail: string
}

// Without this, a missing AUTH_SERVICE_URL/GOOGLE_OAUTH_CLIENT_ID/APP_BASE_URL
// in a deployed environment silently falls back to a localhost value, the API
// boots fine, and login only breaks at the first real attempt — the same class
// of failure COOKIE_SECRET already guards against in app.ts.
function requiredWhenDeployed(name: string, fallback: string, isDeployed: boolean): string {
  const value = process.env[name]
  if (value) {
    return value
  }
  if (isDeployed) {
    throw new Error(`${name} must be set in a deployed environment`)
  }
  return fallback
}

// The dev login mints a session without ever contacting Google or the
// auth-service, so reaching it in a deployed environment would be a complete
// authentication bypass. Refusing to boot turns a misconfiguration into a loud
// CrashLoop instead of a silently open door — the same fail-fast stance the
// COOKIE_SECRET check in app.ts takes.
function resolveDevLoginEnabled(devLoginEmail: string, allowedEmailDomains: string[]): boolean {
  const requested = process.env.DEV_LOGIN_ENABLED === 'true'
  if (!requested) {
    return false
  }

  if (isDeployedEnvironment()) {
    throw new Error(
      'DEV_LOGIN_ENABLED must never be set in a deployed environment ' +
        `(NODE_ENV=${process.env.NODE_ENV}, APP_ENV=${appEnv() || '<unset>'})`,
    )
  }

  // Validated here rather than per-request so a dev session can never differ
  // from a real one in the one dimension the real callback enforces.
  const emailDomain = devLoginEmail.split('@')[1]?.toLowerCase()
  if (!emailDomain || !allowedEmailDomains.includes(emailDomain)) {
    throw new Error(
      `DEV_LOGIN_EMAIL (${devLoginEmail}) must belong to one of ALLOWED_EMAIL_DOMAINS (${allowedEmailDomains.join(', ')})`,
    )
  }

  return true
}

// Not requiredWhenDeployed like its neighbours: the address is fixed in the
// cluster, and a missing variable must not take down the screens that never
// call a service. Wrong, it surfaces as a 503 on the service call instead.
export function authServiceInternalUrl(): string {
  return process.env.AUTH_SERVICE_INTERNAL_URL ?? 'http://auth-service.platform:4000'
}

export function authConfig(): AuthConfig {
  const isDeployed = isDeployedEnvironment()
  const allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? 'piposaude.com.br,pipo.ai')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
  const devLoginEmail = process.env.DEV_LOGIN_EMAIL ?? 'dev@piposaude.com.br'
  // Before the required variables below: a deployed pod carrying the login
  // bypass must say so, not report the first address it happens to be missing.
  const devLoginEnabled = resolveDevLoginEnabled(devLoginEmail, allowedEmailDomains)

  return {
    authServiceUrl: requiredWhenDeployed('AUTH_SERVICE_URL', 'http://localhost:9090', isDeployed),
    authServiceInternalUrl: authServiceInternalUrl(),
    googleClientId: requiredWhenDeployed('GOOGLE_OAUTH_CLIENT_ID', '', isDeployed),
    appBaseUrl: requiredWhenDeployed('APP_BASE_URL', 'http://localhost:5173', isDeployed),
    allowedEmailDomains,
    isDeployed,
    devLoginEnabled,
    devLoginEmail,
  }
}
