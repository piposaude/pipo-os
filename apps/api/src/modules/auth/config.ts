export interface AuthConfig {
  authServiceUrl: string
  googleClientId: string
  appBaseUrl: string
  allowedEmailDomains: string[]
  isProduction: boolean
  devLoginEnabled: boolean
  devLoginEmail: string
}

const DEPLOYED_APP_ENVS = new Set(['stag', 'prod'])

// The dev login mints a session without ever contacting Google or the
// auth-service, so reaching it in a deployed environment would be a complete
// authentication bypass. Refusing to boot turns a misconfiguration into a loud
// CrashLoop instead of a silently open door — the same fail-fast stance the
// COOKIE_SECRET check in app.ts takes.
function resolveDevLoginEnabled(
  isProduction: boolean,
  devLoginEmail: string,
  allowedEmailDomains: string[],
): boolean {
  const requested = process.env.DEV_LOGIN_ENABLED === 'true'
  if (!requested) {
    return false
  }

  const appEnv = (process.env.APP_ENV ?? '').trim().toLowerCase()
  if (isProduction || DEPLOYED_APP_ENVS.has(appEnv)) {
    throw new Error(
      'DEV_LOGIN_ENABLED must never be set in a deployed environment ' +
        `(NODE_ENV=${process.env.NODE_ENV}, APP_ENV=${appEnv || '<unset>'})`,
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

export function authConfig(): AuthConfig {
  const isProduction = process.env.NODE_ENV === 'production'
  const allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? 'piposaude.com.br,pipo.ai')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
  const devLoginEmail = process.env.DEV_LOGIN_EMAIL ?? 'dev@piposaude.com.br'

  return {
    authServiceUrl: process.env.AUTH_SERVICE_URL ?? 'http://localhost:9090',
    googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:5173',
    allowedEmailDomains,
    isProduction,
    devLoginEnabled: resolveDevLoginEnabled(isProduction, devLoginEmail, allowedEmailDomains),
    devLoginEmail,
  }
}
