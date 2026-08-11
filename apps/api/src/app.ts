import path from 'node:path'
import { randomUUID } from 'node:crypto'
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

function corsOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
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
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(cors, { origin: corsOrigins() })
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
    app.register(swaggerUi, { routePrefix: '/docs' })
  }

  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
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
  })

  return app
}
