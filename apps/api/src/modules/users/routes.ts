import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { errorResponseSchema } from '../../shared/schemas.js'
import { STRUCTURE_POLICY, TICKET_POLICY } from '../auth/policy.js'
import { listUsersQuerySchema, userListSchema } from './schemas.js'
import type { UsersService } from './service.js'

export function registerUserRoutes(app: FastifyInstance, service: UsersService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/api/users',
    {
      // Either policy opens it, and a deny of either still closes it: the queue
      // names the owner of every row carrying only the ticket policy.
      config: { policy: [TICKET_POLICY, STRUCTURE_POLICY] },
      schema: {
        querystring: listUsersQuerySchema,
        response: {
          200: userListSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return { data: await service.list(request.query) }
    },
  )
}
