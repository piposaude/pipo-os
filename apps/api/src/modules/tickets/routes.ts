import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  createTicketBodySchema,
  ticketListResponseSchema,
  ticketParamsSchema,
  ticketSchema,
  updateTicketBodySchema,
} from './schemas.js'
import type { TicketsService } from './service.js'

export function registerTicketRoutes(app: FastifyInstance, service: TicketsService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/api/tickets',
    { schema: { response: { 200: ticketListResponseSchema } } },
    async () => service.list(),
  )

  server.post(
    '/api/tickets',
    { schema: { body: createTicketBodySchema, response: { 201: ticketSchema } } },
    async (request, reply) => {
      const ticket = await service.create(request.body)
      reply.status(201)
      return ticket
    },
  )

  server.put(
    '/api/tickets/:id',
    {
      schema: {
        params: ticketParamsSchema,
        body: updateTicketBodySchema,
        response: { 200: ticketSchema },
      },
    },
    async (request) => service.update(request.params.id, request.body),
  )

  server.delete(
    '/api/tickets/:id',
    { schema: { params: ticketParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await service.remove(request.params.id)
      reply.status(204)
      return null
    },
  )
}
