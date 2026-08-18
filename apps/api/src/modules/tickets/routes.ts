import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { UnauthorizedError } from '../../shared/errors.js'
import { SESSION_COOKIE_NAME, extractSessionClaims } from '../auth/session.js'
import { createTicketBodySchema, ticketParamsSchema, ticketSchema } from './schemas.js'
import type { TicketsService } from './service.js'

function requireSession(request: FastifyRequest): void {
  const rawCookie = request.cookies[SESSION_COOKIE_NAME]
  const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null
  const claims = unsigned?.valid && unsigned.value ? extractSessionClaims(unsigned.value) : null

  if (!claims) {
    throw new UnauthorizedError('Not authenticated')
  }
}

export function registerTicketRoutes(app: FastifyInstance, service: TicketsService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/api/tickets/:id',
    { schema: { params: ticketParamsSchema, response: { 200: ticketSchema } } },
    async (request) => {
      requireSession(request)
      return service.get(request.params.id)
    },
  )

  server.post(
    '/api/tickets',
    { schema: { body: createTicketBodySchema, response: { 201: ticketSchema } } },
    async (request, reply) => {
      requireSession(request)
      const ticket = await service.create(request.body)
      reply.status(201)
      return ticket
    },
  )
}
