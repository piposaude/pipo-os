import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { UnauthorizedError } from '../../shared/errors.js'
import { getSession } from '../auth/session.js'
import { ticketParamsSchema } from '../tickets/schemas.js'
import {
  commentListSchema,
  commentSchema,
  createCommentBodySchema,
  errorResponseSchema,
  timelineQuerySchema,
  timelineSchema,
} from './schemas.js'
import type { CommentsService } from './service.js'

export function registerCommentRoutes(app: FastifyInstance, service: CommentsService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/api/tickets/:id/comments',
    {
      schema: {
        params: ticketParamsSchema,
        response: { 200: commentListSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      getSession(request)
      return service.list(request.params.id)
    },
  )

  server.get(
    '/api/tickets/:id/timeline',
    {
      schema: {
        params: ticketParamsSchema,
        querystring: timelineQuerySchema,
        response: {
          200: timelineSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      getSession(request)
      return service.timeline(request.params.id, request.query)
    },
  )

  server.post(
    '/api/tickets/:id/comments',
    {
      schema: {
        params: ticketParamsSchema,
        body: createCommentBodySchema,
        response: {
          201: commentSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const claims = getSession(request)
      const authorId = claims.sub?.trim()
      if (!authorId) throw new UnauthorizedError('Invalid session')
      const comment = await service.add(request.params.id, request.body, authorId)
      reply.status(201)
      return comment
    },
  )
}
