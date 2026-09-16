import path from 'node:path'
import { randomUUID } from 'node:crypto'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from '@fastify/type-provider-zod'
import autoload from '@fastify/autoload'
import { createLoggerOptions } from '@pipo-os/observability/logger'
import metricsPlugin from '@pipo-os/observability/metrics'
import Fastify, { LogController, type FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { z } from 'zod'
import dbPlugin from './infrastructure/db.js'
import errorHandlerPlugin from './infrastructure/error-handler.js'
import authenticatePlugin from './modules/auth/authenticate.js'
import authorizePlugin from './modules/auth/authorize.js'
import { isDeployedEnvironment } from './shared/environment.js'

function corsOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
}

// The session and oauth-state cookies are signed with this secret (HMAC) — it's
// what lets the API trust a cookie's contents without being able to verify the
// auth-service's JWT signature locally (that key lives in AWS KMS, see the auth
// module). A weak/default secret in a deployed environment would let anyone
// forge a session, so we fail fast there instead of booting with a guessable one.
function cookieSecret(): string {
  const secret = process.env.COOKIE_SECRET
  if (secret) {
    return secret
  }
  if (isDeployedEnvironment()) {
    throw new Error('COOKIE_SECRET must be set in a deployed environment')
  }
  return 'dev-only-cookie-secret-change-me'
}

// Fastify's requestIdHeader adopts the client's x-request-id verbatim, unvalidated,
// straight into logs. Sizing/charset it here instead so a caller can't inject
// control characters or unbounded strings into the log stream.
const REQUEST_ID_HEADER = 'x-request-id'
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/

function genRequestId(request: { headers: Record<string, unknown> }): string {
  const headerValue = request.headers[REQUEST_ID_HEADER]
  if (typeof headerValue === 'string' && REQUEST_ID_PATTERN.test(headerValue)) {
    return headerValue
  }
  return randomUUID()
}

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: createLoggerOptions(),
    logController: new LogController({ requestIdLogLabel: 'request-id' }),
    genReqId: genRequestId,
    // A member id is an e-mail capped at 255 in addMemberBodySchema; the router
    // default of 100 answered 414 for a member the POST had just accepted.
    routerOptions: { maxParamLength: 255 },
    // Fastify's own default, written down: it is the ceiling the nginx-ingress
    // also applies, and no route should inherit it by accident.
    bodyLimit: 1_048_576,
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(cors, { origin: corsOrigins() })
  app.register(cookie, { secret: cookieSecret() })
  app.register(authenticatePlugin)
  app.register(authorizePlugin)
  app.register(metricsPlugin)
  app.register(dbPlugin)
  app.register(errorHandlerPlugin)

  app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'pipo-os API',
        description: 'Contrato REST do PipOS',
        version: '1.0.0',
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  })

  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    // Swagger-ui owns its routes, so they cannot carry `config: { public: true }`
    // themselves. Stamping it here, in a scope of their own, is what keeps the
    // auth hook down to one rule: a route is public because it says so.
    app.register(async (docs) => {
      docs.addHook('onRoute', (route) => {
        route.config = { ...route.config, public: true }
      })
      await docs.register(swaggerUi, { routePrefix: '/docs' })
    })
  }

  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      config: { public: true },
      schema: {
        response: {
          200: z.object({ status: z.literal('ok') }),
          503: z.object({ status: z.literal('unavailable') }),
        },
      },
    },
    async (request, reply) => {
      try {
        await sql`SELECT 1`.execute(app.db)
        return { status: 'ok' as const }
      } catch (error) {
        request.log.error(error, 'health check failed: database unreachable')
        reply.status(503)
        return { status: 'unavailable' as const }
      }
    },
  )

  app.register(autoload, {
    dir: path.join(import.meta.dirname, 'modules'),
    dirNameRoutePrefix: false,
    // Anchored to the extension: loose in the pattern, it would drop from the
    // route tree any file with `.test.` in the middle of its name.
    ignorePattern: /\.test(-helpers)?\.[cm]?[jt]s$/,
  })

  return app
}
