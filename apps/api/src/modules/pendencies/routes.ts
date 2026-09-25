import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { errorResponseSchema } from '../../shared/schemas.js'
import { TICKET_POLICY } from '../auth/policy.js'
import { listPendencyItems } from './repository.js'
import { listPendencyItemsQuerySchema, pendencyItemListSchema } from './schemas.js'

export function registerPendencyRoutes(app: FastifyInstance): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/api/pendency-items',
    {
      config: { policy: TICKET_POLICY },
      schema: {
        querystring: listPendencyItemsQuerySchema,
        response: {
          200: pendencyItemListSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request) => ({
      data: await listPendencyItems(app.db, request.query.enrollmentType),
    }),
  )
}
