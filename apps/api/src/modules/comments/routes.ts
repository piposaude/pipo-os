import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import type { FastifyInstance } from 'fastify'
import { requireAuthor } from '../auth/authenticate.js'
import { errorResponseSchema } from '../../shared/schemas.js'
import { TICKET_POLICY } from '../auth/policy.js'
import { ticketParamsSchema } from '../tickets/schemas.js'
import {
  commentListSchema,
  commentSchema,
  createCommentBodySchema,
  timelineQuerySchema,
  timelineSchema,
  withDefaultKind,
} from './schemas.js'
import type { CommentsService } from './service.js'

export function registerCommentRoutes(app: FastifyInstance, service: CommentsService): void {
  const server = app.withTypeProvider<ZodTypeProvider>()

  server.get(
    '/api/tickets/:id/comments',
    {
      config: { policy: TICKET_POLICY, serviceAllowed: true },
      schema: {
        params: ticketParamsSchema,
        response: {
          200: commentListSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      return service.list(request.params.id)
    },
  )

  server.get(
    '/api/tickets/:id/timeline',
    {
      config: { policy: TICKET_POLICY },
      schema: {
        params: ticketParamsSchema,
        querystring: timelineQuerySchema,
        response: {
          200: timelineSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      // TODO: no portfolio filter yet, so a policy holder reads the chronology of
      // any company's ticket, internal comments included (ACE-147)
      return service.timeline(request.params.id, request.query)
    },
  )

  server.post(
    '/api/tickets/:id/comments',
    {
      config: { policy: TICKET_POLICY, serviceAllowed: true },
      // A quarter of the global limit, over 5x the 50k characters the schema
      // accepts as raw UTF-8, so a multibyte body still reaches the field check.
      bodyLimit: 262_144,
      // Before validation, so a body with no `kind` — which is every caller
      // today — is still the manual comment it always was. `body` is loose on
      // purpose: nothing has validated it yet.
      preValidation: (request: { body: unknown }, _reply, done) => {
        request.body = withDefaultKind(request.body)
        done()
      },
      schema: {
        params: ticketParamsSchema,
        body: createCommentBodySchema,
        response: {
          // 200 is the redelivery answering with the event already written;
          // 201 is the one that wrote it.
          200: commentSchema,
          201: commentSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const author = requireAuthor(request)
      const { comment, created } = await service.add(request.params.id, request.body, author)

      /* A replay is absorbed on purpose, but silently absorbing it leaves no
         way to see a caller reusing one key for two different events — the
         second would vanish from the chronology with nothing to look at. */
      if (!created) {
        request.log.info(
          { ticketId: request.params.id, commentId: comment.id },
          'automated event replay absorbed',
        )
      }

      reply.status(created ? 201 : 200)
      return comment
    },
  )
}
