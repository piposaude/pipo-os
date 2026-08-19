import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { UnauthorizedError } from '../../shared/errors.js'
import { SESSION_COOKIE_NAME, extractSessionClaims, type SessionClaims } from '../auth/session.js'
import {
  createTicketBodySchema,
  errorResponseSchema,
  ticketParamsSchema,
  ticketSchema,
  updateTicketBodySchema,
} from './schemas.js'
import type { TicketsService } from './service.js'

function requireSession(request: FastifyRequest): SessionClaims {
  const rawCookie = request.cookies[SESSION_COOKIE_NAME]
  const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null
  const claims = unsigned?.valid && unsigned.value ? extractSessionClaims(unsigned.value) : null

  if (!claims) {
    throw new UnauthorizedError('Not authenticated')
  }

  return claims
}

export function registerTicketRoutes(app: FastifyInstance, service: TicketsService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/api/tickets/:id',
    {
      schema: {
        params: ticketParamsSchema,
        response: { 200: ticketSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      requireSession(request)
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
      requireSession(request)
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
      requireSession(request)
      return service.update(request.params.id, request.body)
    },
  )
}
