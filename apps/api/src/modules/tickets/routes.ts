import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { requireUser, requireUserId } from '../auth/authenticate.js'
import { businessToday } from '../../shared/business-date.js'
import { errorResponseSchema } from '../../shared/schemas.js'
import { TICKET_POLICY } from '../auth/policy.js'
import { ticketRowsQuerySchema, ticketRowsSchema } from './rows-schema.js'
import { OpenTicketConflictError } from './errors.js'
import {
  createTicketBodySchema,
  listTicketsQuerySchema,
  openTicketConflictSchema,
  ticketListSchema,
  ticketParamsSchema,
  ticketSchema,
  updateTicketBodySchema,
  updateTicketStatusBodySchema,
} from './schemas.js'
import type { TicketsService } from './service.js'

export function registerTicketRoutes(app: FastifyInstance, service: TicketsService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/api/tickets',
    {
      // The EI looks a ticket up by enrollmentId to stay idempotent, and route
      // config cannot demand a query param — so this opens the bare list too.
      config: { policy: TICKET_POLICY, serviceAllowed: true },
      schema: {
        querystring: listTicketsQuerySchema,
        response: {
          200: ticketListSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request) => {
      // TODO: the ticket policy is the door, not the portfolio: any holder still
      // lists any company's tickets by omitting companyId (ACE-147)
      return service.list(request.query)
    },
  )

  server.get(
    '/api/tickets/rows',
    {
      config: { policy: TICKET_POLICY },
      schema: {
        querystring: ticketRowsQuerySchema,
        response: {
          200: ticketRowsSchema,
          // The querystring is a contract of its own — an unknown status or a
          // limit out of range is a 400 the caller has to be able to read.
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { email } = requireUser(request)
      // TODO: no portfolio filter yet, and this one answers up to 5000 rows at
      // once, with beneficiary name and tax id (ACE-147)
      return service.rows(request.query, email, businessToday())
    },
  )

  server.get(
    '/api/tickets/:id',
    {
      config: { policy: TICKET_POLICY, serviceAllowed: true },
      schema: {
        params: ticketParamsSchema,
        response: {
          200: ticketSchema,
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

  server.post(
    '/api/tickets',
    {
      config: { policy: TICKET_POLICY, serviceAllowed: true },
      schema: {
        body: createTicketBodySchema,
        response: {
          201: ticketSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          409: openTicketConflictSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const ticket = await service.create(request.body)
        reply.status(201)
        return ticket
      } catch (err) {
        // The shared handler serializes error, message and details only, so the
        // id is added here; without this catch the 409 is still correct.
        if (err instanceof OpenTicketConflictError) {
          return reply
            .status(409)
            .send({ error: err.name, message: err.message, ticketId: err.ticketId })
        }
        throw err
      }
    },
  )

  server.patch(
    '/api/tickets/:id',
    {
      config: { policy: TICKET_POLICY },
      schema: {
        params: ticketParamsSchema,
        body: updateTicketBodySchema,
        response: {
          200: ticketSchema,
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
      return service.update(request.params.id, request.body)
    },
  )

  server.patch(
    '/api/tickets/:id/status',
    {
      config: { policy: TICKET_POLICY },
      schema: {
        params: ticketParamsSchema,
        body: updateTicketStatusBodySchema,
        response: {
          200: ticketSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const authorId = requireUserId(request)
      return service.changeStatus(request.params.id, request.body, authorId)
    },
  )

  server.post(
    '/api/tickets/:id/claim',
    {
      config: { policy: TICKET_POLICY },
      schema: {
        params: ticketParamsSchema,
        response: {
          200: ticketSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const assigneeId = requireUserId(request)
      return service.claim(request.params.id, assigneeId)
    },
  )
}
