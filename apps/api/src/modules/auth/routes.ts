import { randomUUID } from 'node:crypto'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UnauthorizedError } from '../../shared/errors.js'
import type { AuthConfig } from './config.js'
import { googleCallbackQuerySchema, googleLoginQuerySchema, meResponseSchema } from './schemas.js'
import { AuthService, IdentityNotFoundError } from './service.js'
import {
  baseCookieOptions,
  extractSessionClaims,
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  sessionMaxAgeSeconds,
} from './session.js'

// Guards the `redirect` query param against open redirects: only a same-site
// path is accepted. Rejects protocol-relative ("//evil.com") and the
// backslash variant some browsers still normalize to it ("/\evil.com").
const SAFE_REDIRECT_PATTERN = /^\/[^/\\]\S*$/

function safeRedirectPath(candidate: string | undefined): string {
  return candidate && SAFE_REDIRECT_PATTERN.test(candidate) ? candidate : '/'
}

// A same-origin relative path, not `${appBaseUrl}/login?...` — the web app
// and the API always share an origin (Vite's dev proxy, and the same Ingress
// host in stag/prod), so a relative redirect works everywhere and doesn't
// depend on appBaseUrl exactly matching how this request was actually reached.
function loginErrorUrl(code: string): string {
  return `/login?error=${encodeURIComponent(code)}`
}

interface OAuthState {
  state: string
  redirect: string
}

function parseStateCookie(value: string | null | undefined): OAuthState | null {
  if (!value) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>).state === 'string' &&
      typeof (parsed as Record<string, unknown>).redirect === 'string'
    ) {
      return parsed as OAuthState
    }
  } catch {
    // fall through to null below
  }
  return null
}

export function registerAuthRoutes(
  app: FastifyInstance,
  service: AuthService,
  config: AuthConfig,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/api/auth/google',
    { schema: { querystring: googleLoginQuerySchema, response: { 302: z.null() } } },
    async (request, reply) => {
      const state: OAuthState = {
        state: randomUUID(),
        redirect: safeRedirectPath(request.query.redirect),
      }

      reply.setCookie(OAUTH_STATE_COOKIE_NAME, JSON.stringify(state), {
        ...baseCookieOptions(config),
        maxAge: 300,
      })

      return reply.redirect(service.buildAuthorizeUrl(state.state))
    },
  )

  server.get(
    '/api/auth/google/callback',
    { schema: { querystring: googleCallbackQuerySchema, response: { 302: z.null() } } },
    async (request, reply) => {
      const rawStateCookie = request.cookies[OAUTH_STATE_COOKIE_NAME]
      reply.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: '/' })

      const unsigned = rawStateCookie ? request.unsignCookie(rawStateCookie) : null
      const oauthState = parseStateCookie(unsigned?.valid ? unsigned.value : null)

      const { code, state, error } = request.query

      if (error || !code || !state || !oauthState || state !== oauthState.state) {
        return reply.redirect(loginErrorUrl(error ? 'access_denied' : 'invalid_state'))
      }

      try {
        const accessToken = await service.exchangeCode(code)
        const claims = extractSessionClaims(accessToken)

        if (!claims) {
          return reply.redirect(loginErrorUrl('invalid_token'))
        }

        const emailDomain = claims.email.split('@')[1]?.toLowerCase()
        if (!emailDomain || !config.allowedEmailDomains.includes(emailDomain)) {
          return reply.redirect(loginErrorUrl('domain_not_allowed'))
        }

        reply.setCookie(SESSION_COOKIE_NAME, accessToken, {
          ...baseCookieOptions(config),
          maxAge: sessionMaxAgeSeconds(claims),
        })

        return reply.redirect(oauthState.redirect)
      } catch (loginError) {
        if (loginError instanceof IdentityNotFoundError) {
          return reply.redirect(loginErrorUrl('identity_not_found'))
        }
        request.log.error(loginError, 'google login exchange failed')
        return reply.redirect(loginErrorUrl('auth_service_unavailable'))
      }
    },
  )

  server.get(
    '/api/auth/me',
    { schema: { response: { 200: meResponseSchema } } },
    async (request) => {
      const rawSessionCookie = request.cookies[SESSION_COOKIE_NAME]
      const unsigned = rawSessionCookie ? request.unsignCookie(rawSessionCookie) : null
      const claims = unsigned?.valid && unsigned.value ? extractSessionClaims(unsigned.value) : null

      if (!claims) {
        throw new UnauthorizedError('Not authenticated')
      }

      return { email: claims.email, policies: claims.policies }
    },
  )

  server.post(
    '/api/auth/logout',
    { schema: { response: { 204: z.null() } } },
    async (_request, reply) => {
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
      reply.status(204)
      return null
    },
  )
}
