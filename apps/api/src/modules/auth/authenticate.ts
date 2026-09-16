import type { FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { verifyToken } from '../../infrastructure/auth-service-internal.js'
import { ForbiddenError, UnauthorizedError } from '../../shared/errors.js'
import { authServiceInternalUrl } from './config.js'
import { policyString, requiredPolicies } from './policy.js'
import {
  SESSION_COOKIE_NAME,
  decodeJwtPayload,
  extractSessionClaims,
  type SessionClaims,
} from './session.js'
import {
  allowedServiceAccounts,
  bearerToken,
  serviceAccountKey,
  serviceAccountOf,
  tokenExpired,
} from './service-principal.js'

export interface UserPrincipal extends SessionClaims {
  kind: 'user'
}

/** A caller that is not a person: a Pipo service, recognised by the service
 *  account token of its pod instead of a login. */
export interface ServicePrincipal {
  kind: 'service'
  name: string
  identityId: string
  policies: string[]
}

export type Principal = UserPrincipal | ServicePrincipal

/** The author stamped on a row. `type` is the principal's kind, not a copy of
 *  its values: the column and the caller cannot drift apart. */
export interface Author {
  id: string
  type: Principal['kind']
}

declare module 'fastify' {
  interface FastifyRequest {
    // Optional on purpose: a public route has no principal, and the compiler is
    // what stops a handler there from reading one that is not going to be set.
    principal?: Principal
  }

  interface FastifyContextConfig {
    public?: boolean
    // Opt-in, one route at a time: a service reaching a route that never named
    // itself gets 403, so a route added later is closed to services by default.
    serviceAllowed?: boolean
  }
}

// Handlers reach the principal through this, never through request.principal,
// so a public route asking for one answers 401 instead of a TypeError.
export function requirePrincipal(request: FastifyRequest): Principal {
  const principal = request.principal

  if (!principal) {
    throw new UnauthorizedError('Not authenticated')
  }

  return principal
}

/** For a handler that only makes sense for a person: an author, an assignee,
 *  the `@me` of a queue. A service holding the policy still gets 403 here. */
export function requireUser(request: FastifyRequest): UserPrincipal {
  const principal = requirePrincipal(request)

  if (principal.kind !== 'user') {
    throw new ForbiddenError('This action belongs to a person, not to a service')
  }

  return principal
}

/** Who to record as the author of a write, id and kind resolved in one place
 *  so no writer has to infer one from the other. A person is their `sub`; a
 *  service is `svc:<name>`, in the same text column, because blanking the
 *  author would lose who wrote it. */
export function requireAuthor(request: FastifyRequest): Author {
  const principal = requirePrincipal(request)
  const id = principal.kind === 'service' ? `svc:${principal.name}` : requireUserId(request)

  return { id, type: principal.kind }
}

// The access-token may carry no `sub`, so a handler writing an author or an
// assignee has to demand it instead of assuming it.
export function requireUserId(request: FastifyRequest): string {
  const sub = requireUser(request).sub?.trim()

  if (!sub) {
    throw new UnauthorizedError('Invalid session')
  }

  return sub
}

function auditOf(request: FastifyRequest, serviceName: string) {
  const header = (name: string): string | undefined => {
    const value = request.headers[name]
    return typeof value === 'string' ? value : undefined
  }

  // The last entry, not the whole header: the ingress appends the peer it saw,
  // so everything before it is whatever the caller chose to send. With
  // trustProxy off, request.ip is the ingress itself, which audits nothing.
  const forwardedFor = header('x-forwarded-for')?.split(',').pop()?.trim()

  return {
    requestId: request.id,
    correlationId: header('x-correlation-id'),
    userId: `svc:${serviceName}`,
    sourceIp: forwardedFor || request.ip,
  }
}

async function servicePrincipal(
  request: FastifyRequest,
  token: string,
  policies: string[],
): Promise<ServicePrincipal> {
  const payload = decodeJwtPayload(token)
  const account = serviceAccountOf(payload)

  if (!account) {
    throw new UnauthorizedError('Not a service account token')
  }

  if (tokenExpired(payload)) {
    throw new UnauthorizedError('Service account token is expired')
  }

  // Namespace included: the allowlist is our own fence, and the auth-service
  // resolves the identity by name alone, so a homonym elsewhere would pass.
  const accountKey = serviceAccountKey(account)
  if (!allowedServiceAccounts().has(accountKey)) {
    request.log.warn(
      { serviceAccount: accountKey },
      'request refused: service account is not in the allowlist',
    )
    throw new ForbiddenError(`Service account ${accountKey} is not allowed`)
  }

  const identityId = await verifyToken({
    baseUrl: authServiceInternalUrl(),
    token,
    policies,
    audit: auditOf(request, account.name),
  })

  return { kind: 'service', name: account.name, identityId, policies }
}

export default fp(
  async function authenticatePlugin(app) {
    app.decorateRequest('principal')

    // A service is let in against the policy its route names, so a route that
    // opens to services without naming one would reach verify-token with an
    // empty requirement: identity checked, authorisation not.
    app.addHook('onRoute', (route) => {
      // `?? []` and not `=== undefined`: an empty array is a policy config too,
      // and it would reach verify-token as no requirement at all.
      if (
        route.config?.serviceAllowed === true &&
        requiredPolicies(route.config.policy ?? []).length === 0
      ) {
        throw new Error(
          `Route ${route.method} ${route.url} accepts a service but declares no policy`,
        )
      }
    })

    app.addHook('onRequest', async (request) => {
      // The 404 context inherits root hooks with an empty config: without this
      // an unknown route would answer 401 instead of 404.
      if (request.is404) {
        return
      }

      if (request.routeOptions.config.public === true) {
        return
      }

      const rawCookie = request.cookies[SESSION_COOKIE_NAME]
      const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null
      const claims = unsigned?.valid && unsigned.value ? extractSessionClaims(unsigned.value) : null

      if (claims) {
        request.principal = { kind: 'user', ...claims }
        return
      }

      const token = bearerToken(request.headers.authorization)

      if (!token) {
        throw new UnauthorizedError('Not authenticated')
      }

      // Read before the token is decoded, and before any call upstream: a route
      // that does not accept services closes here, and a broken auth-service
      // cannot turn that refusal into a 503.
      if (request.routeOptions.config.serviceAllowed !== true) {
        throw new ForbiddenError('This route does not accept a service caller')
      }

      // The boot guard is what normally catches this; a route that reached here
      // without a policy escaped it, and saying so beats blaming the caller.
      const wanted = requiredPolicies(request.routeOptions.config.policy ?? []).map(policyString)
      if (wanted.length === 0) {
        request.log.error({ url: request.url }, 'route accepts a service but declares no policy')
        throw new ForbiddenError('This route is not configured to accept a service caller')
      }

      request.principal = await servicePrincipal(request, token, wanted)
    })
  },
  // Both run their own onRequest hook, and hooks fire in registration order:
  // before @fastify/cookie there is no request.cookies to read, and before
  // @fastify/cors a browser preflight would get 401 here instead of the 204
  // cors answers on its own — with every test still green, since inject()
  // sends no preflight.
  { name: 'authenticate', dependencies: ['@fastify/cookie', '@fastify/cors'] },
)
