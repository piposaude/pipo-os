import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { NotFoundError } from '../../shared/errors.js'
import type { AuthConfig } from './config.js'
import {
  baseCookieOptions,
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
} from './session.js'

// Fastify's trustProxy is off, so request.ip is the real socket peer and cannot
// be forged through X-Forwarded-For. Inside the cluster every request arrives
// via the Ingress, so it is never loopback.
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

// nullish, not optional: a POST with no payload arrives as `null`, which
// z.optional() (undefined only) would reject with a 400.
const devLoginBodySchema = z
  .object({
    policies: z.array(z.string()).optional(),
  })
  .nullish()

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

// Shaped like the auth-service's access token so the session flows through the
// exact same code path as a real login. The signature is deliberately not a
// signature: nothing verifies the JWT (the real one is signed by AWS KMS, with
// no public JWKS), integrity comes from the signed cookie wrapping it. `alg:
// none` and the fake signature keep that honest and obvious to anyone reading
// a decoded dev token.
function mintDevToken(email: string, policies: string[]): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: 'pipo-os-dev-login',
      sub: '00000000-0000-4000-8000-000000000000',
      email,
      iat: now,
      exp: now + DEFAULT_SESSION_MAX_AGE_SECONDS,
      policies,
      'token-type': 'access_token',
    }),
  )

  return `${header}.${payload}.dev-login-not-a-real-signature`
}

// Only ever called when config.devLoginEnabled is true — when it is false this
// route is never added to the routing table, so the endpoint 404s in any
// deployed environment instead of merely rejecting requests.
export function registerDevLoginRoute(app: FastifyInstance, config: AuthConfig): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  app.log.warn(
    { email: config.devLoginEmail },
    'DEV LOGIN ENABLED: POST /api/auth/dev-login mints sessions without Google. Never enable this outside local development.',
  )

  server.post(
    '/api/auth/dev-login',
    {
      schema: {
        body: devLoginBodySchema,
        response: { 204: z.null() },
        // Kept out of the published contract: it must not reach the generated
        // api-client, and openapi.json must not change depending on whether
        // dev login is on (the CI drift check compares it byte for byte).
        hide: true,
      },
    },
    async (request, reply) => {
      if (!LOOPBACK_ADDRESSES.has(request.ip)) {
        request.log.warn({ ip: request.ip }, 'dev login rejected: non-loopback origin')
        throw new NotFoundError('Not found')
      }

      const policies = request.body?.policies ?? []
      const token = mintDevToken(config.devLoginEmail, policies)

      reply.setCookie(SESSION_COOKIE_NAME, token, {
        ...baseCookieOptions(config),
        maxAge: DEFAULT_SESSION_MAX_AGE_SECONDS,
      })

      reply.status(204)
      return null
    },
  )
}
