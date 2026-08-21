import type { CookieSerializeOptions } from '@fastify/cookie'
import type { FastifyRequest } from 'fastify'
import { UnauthorizedError } from '../../shared/errors.js'
import type { AuthConfig } from './config.js'

export const SESSION_COOKIE_NAME = 'pipo_os_session'
export const OAUTH_STATE_COOKIE_NAME = 'pipo_os_oauth_state'

export const DEFAULT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

export function baseCookieOptions(config: AuthConfig): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    // Lax (not Strict): the oauth-state cookie must survive the top-level,
    // cross-site GET navigation Google issues back to our callback.
    sameSite: 'lax',
    path: '/',
    signed: true,
  }
}

export interface SessionClaims {
  sub?: string
  email: string
  policies: string[]
  exp: number
}

// The access-token is a JWT signed by the auth-service via AWS KMS (ES256) —
// there's no JWKS to verify that signature locally. We only decode the
// payload here; integrity of the *cookie* (not the JWT) comes from
// @fastify/cookie's signing, which is what actually stops a client from
// forging a session (see request.unsignCookie at the call sites).
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.')
  if (segments.length !== 3) {
    return null
  }
  try {
    const json = Buffer.from(segments[1], 'base64url').toString('utf-8')
    const payload = JSON.parse(json) as unknown
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function extractSessionClaims(token: string): SessionClaims | null {
  const payload = decodeJwtPayload(token)
  if (!payload) {
    return null
  }

  const { sub, email, exp, policies } = payload

  if (typeof email !== 'string' || typeof exp !== 'number' || exp * 1000 <= Date.now()) {
    return null
  }

  return {
    sub: typeof sub === 'string' ? sub : undefined,
    email,
    exp,
    policies: Array.isArray(policies)
      ? policies.filter((p): p is string => typeof p === 'string')
      : [],
  }
}

export function sessionMaxAgeSeconds(claims: SessionClaims): number {
  const remaining = claims.exp - Math.floor(Date.now() / 1000)
  return remaining > 0 ? remaining : DEFAULT_SESSION_MAX_AGE_SECONDS
}

export function getSession(request: FastifyRequest): SessionClaims {
  const rawCookie = request.cookies[SESSION_COOKIE_NAME]
  const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null
  const claims = unsigned?.valid && unsigned.value ? extractSessionClaims(unsigned.value) : null

  if (!claims) {
    throw new UnauthorizedError('Not authenticated')
  }

  return claims
}
