import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { requireUser, requireUserId } from '../auth/authenticate.js'
import { errorResponseSchema } from '../../shared/schemas.js'
import { isAuthorized, STRUCTURE_POLICY, TICKET_POLICY } from '../auth/policy.js'
import { ticketListSchema } from '../tickets/schemas.js'
import {
  createQueueBodySchema,
  listQueueTicketsQuerySchema,
  listQueuesQuerySchema,
  queueListSchema,
  queueParamsSchema,
  queueSchema,
  updateQueueBodySchema,
} from './schemas.js'
import type { Viewer } from './permissions.js'
import type { QueuesService } from './service.js'

/** Creating a personal view is an analyst's action, so the ticket policy opens
 *  these routes too; who may touch which view is the service's rule. */
const CRUD_POLICY = [TICKET_POLICY, STRUCTURE_POLICY]

/** The structure policy is the key to the whole tree; the role inside a group
 *  is what the service reads for everyone else. */
const viewerOf = (request: FastifyRequest): Viewer => ({
  id: requireUserId(request),
  structureAdmin: isAuthorized(requireUser(request).policies, [STRUCTURE_POLICY]),
})

export function registerQueueRoutes(app: FastifyInstance, service: QueuesService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.post(
    '/api/queues',
    {
      config: { policy: CRUD_POLICY },
      schema: {
        body: createQueueBodySchema,
        response: {
          201: queueSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const queue = await service.create(request.body, viewerOf(request))
      reply.status(201)
      return queue
    },
  )

  server.get(
    '/api/queues',
    {
      config: { policy: CRUD_POLICY },
      schema: {
        querystring: listQueuesQuerySchema,
        response: {
          200: queueListSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.list(request.query)
    },
  )

  server.get(
    '/api/queues/:id',
    {
      config: { policy: CRUD_POLICY },
      schema: {
        params: queueParamsSchema,
        response: {
          200: queueSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.get(request.params.id)
    },
  )

  server.patch(
    '/api/queues/:id',
    {
      config: { policy: CRUD_POLICY },
      schema: {
        params: queueParamsSchema,
        body: updateQueueBodySchema,
        response: {
          200: queueSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.update(request.params.id, request.body, viewerOf(request))
    },
  )

  server.delete(
    '/api/queues/:id',
    {
      config: { policy: CRUD_POLICY },
      schema: {
        params: queueParamsSchema,
        response: {
          204: z.null(),
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await service.delete(request.params.id, viewerOf(request))
      reply.status(204)
      return null
    },
  )

  server.get(
    '/api/queues/:id/tickets',
    {
      config: { policy: TICKET_POLICY },
      schema: {
        params: queueParamsSchema,
        querystring: listQueueTicketsQuerySchema,
        response: {
          200: ticketListSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.listTickets(request.params.id, request.query)
    },
  )
}
