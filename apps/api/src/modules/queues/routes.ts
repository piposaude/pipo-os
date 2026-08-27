import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UnauthorizedError } from '../../shared/errors.js'
import { getSession } from '../auth/session.js'
import { ticketListSchema } from '../tickets/schemas.js'
import {
  addQueueGroupBodySchema,
  createQueueBodySchema,
  errorResponseSchema,
  listQueueTicketsQuerySchema,
  listQueuesQuerySchema,
  queueGroupParamsSchema,
  queueGroupSchema,
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
      schema: {
        body: createQueueBodySchema,
        response: { 201: queueSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const claims = getSession(request)
      const createdBy = claims.sub?.trim()
      if (!createdBy) {
        throw new UnauthorizedError('Invalid session')
      }
      const queue = await service.create(request.body, createdBy)
      reply.status(201)
      return queue
    },
  )

  server.get(
    '/api/queues',
    {
      schema: {
        querystring: listQueuesQuerySchema,
        response: { 200: queueListSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      getSession(request)
      return service.list(request.query)
    },
  )

  server.get(
    '/api/queues/:id',
    {
      schema: {
        params: queueParamsSchema,
        response: { 200: queueSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      getSession(request)
      return service.get(request.params.id)
    },
  )

  server.patch(
    '/api/queues/:id',
    {
      schema: {
        params: queueParamsSchema,
        body: updateQueueBodySchema,
        response: {
          200: queueSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const claims = getSession(request)
      const updatedBy = claims.sub?.trim()
      if (!updatedBy) throw new UnauthorizedError('Invalid session')
      return service.update(request.params.id, request.body, updatedBy)
    },
  )

  server.delete(
    '/api/queues/:id',
    {
      schema: {
        params: queueParamsSchema,
        response: {
          204: z.null(),
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      getSession(request)
      await service.delete(request.params.id)
      reply.status(204)
      return null
    },
  )

  server.post(
    '/api/queues/:id/groups',
    {
      schema: {
        params: queueParamsSchema,
        body: addQueueGroupBodySchema,
        response: {
          201: queueGroupSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      getSession(request)
      const group = await service.addGroup(request.params.id, request.body.groupId)
      reply.status(201)
      return group
    },
  )

  server.delete(
    '/api/queues/:id/groups/:groupId',
    {
      schema: {
        params: queueGroupParamsSchema,
        response: {
          204: z.null(),
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      getSession(request)
      await service.removeGroup(request.params.id, request.params.groupId)
      reply.status(204)
      return null
    },
  )

  server.get(
    '/api/queues/:id/tickets',
    {
      schema: {
        params: queueParamsSchema,
        querystring: listQueueTicketsQuerySchema,
        response: { 200: ticketListSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      getSession(request)
      return service.listTickets(request.params.id, request.query)
    },
  )
}
