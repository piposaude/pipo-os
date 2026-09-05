import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { UnauthorizedError } from '../../shared/errors.js'
import { getSession } from '../auth/session.js'
import { businessToday } from '../../shared/business-date.js'
import { ticketRowsQuerySchema, ticketRowsSchema } from './rows-schema.js'
import {
  createTicketBodySchema,
  errorResponseSchema,
  listTicketsQuerySchema,
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
      schema: {
        querystring: listTicketsQuerySchema,
        response: { 200: ticketListSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      getSession(request)
      // TODO: enforce tenant scope from session claims before this endpoint goes to production
      // Any authenticated user can currently list tickets from any company by omitting companyId
      return service.list(request.query)
    },
  )

  server.get(
    '/api/tickets/rows',
    {
      schema: {
        querystring: ticketRowsQuerySchema,
        response: {
          200: ticketRowsSchema,
          // The querystring is a contract of its own — an unknown status or a
          // limit out of range is a 400 the caller has to be able to read.
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { email } = getSession(request)
      // TODO: enforce tenant scope from session claims before this endpoint goes to production
      // Any authenticated user can currently read rows from any company, and this one
      // answers up to 5000 of them at once, with beneficiary name and tax id
      return service.rows(request.query, email, businessToday())
    },
  )

  server.get(
    '/api/tickets/:id',
    {
      schema: {
        params: ticketParamsSchema,
        response: { 200: ticketSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      getSession(request)
      return service.get(request.params.id)
    },
  )

  server.post(
    '/api/tickets',
    {
      schema: {
        body: createTicketBodySchema,
        response: { 201: ticketSchema, 401: errorResponseSchema, 409: errorResponseSchema },
      },
    },
    async (request, reply) => {
      getSession(request)
      const ticket = await service.create(request.body)
      reply.status(201)
      return ticket
    },
  )

  server.patch(
    '/api/tickets/:id',
    {
      schema: {
        params: ticketParamsSchema,
        body: updateTicketBodySchema,
        response: {
          200: ticketSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      getSession(request)
      return service.update(request.params.id, request.body)
    },
  )

  server.patch(
    '/api/tickets/:id/status',
    {
      schema: {
        params: ticketParamsSchema,
        body: updateTicketStatusBodySchema,
        response: {
          200: ticketSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const claims = getSession(request)
      const authorId = claims.sub?.trim()
      if (!authorId) throw new UnauthorizedError('Invalid session')
      return service.changeStatus(request.params.id, request.body, authorId)
    },
  )

  server.post(
    '/api/tickets/:id/claim',
    {
      schema: {
        params: ticketParamsSchema,
        response: {
          200: ticketSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          422: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const claims = getSession(request)
      const assigneeId = claims.sub?.trim()
      if (!assigneeId) {
        throw new UnauthorizedError('Invalid session')
      }
      return service.claim(request.params.id, assigneeId)
    },
  )
}
