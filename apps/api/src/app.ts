import path from 'node:path'
import cors from '@fastify/cors'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from '@fastify/type-provider-zod'
import autoload from '@fastify/autoload'
import Fastify, { type FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { z } from 'zod'
import dbPlugin from './infrastructure/db.js'
import errorHandlerPlugin from './infrastructure/error-handler.js'

function corsOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
}

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
    requestIdHeader: 'x-request-id',
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(cors, { origin: corsOrigins() })
  app.register(dbPlugin)
  app.register(errorHandlerPlugin)

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
