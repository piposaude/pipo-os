import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireUserId } from '../auth/authenticate.js'
import { errorResponseSchema } from '../../shared/schemas.js'
import { STRUCTURE_POLICY, TICKET_POLICY } from '../auth/policy.js'
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
import type { QueuesService } from './service.js'

export function registerQueueRoutes(app: FastifyInstance, service: QueuesService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.post(
    '/api/queues',
    {
      config: { policy: STRUCTURE_POLICY },
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
      const createdBy = requireUserId(request)
      const queue = await service.create(request.body, createdBy)
      reply.status(201)
      return queue
    },
  )

  server.get(
    '/api/queues',
    {
      config: { policy: STRUCTURE_POLICY },
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
      config: { policy: STRUCTURE_POLICY },
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
      config: { policy: STRUCTURE_POLICY },
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
      const updatedBy = requireUserId(request)
      return service.update(request.params.id, request.body, updatedBy)
    },
  )

  server.delete(
    '/api/queues/:id',
    {
      config: { policy: STRUCTURE_POLICY },
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
      await service.delete(request.params.id)
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
