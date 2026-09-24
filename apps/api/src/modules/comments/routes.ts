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
  createSubmissionBodySchema,
  submissionSchema,
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

      /* Absorbing a replay in silence leaves no way to see a key reused for two
         different events, and the second would vanish from the chronology.
         Type and body are both compared because either one alone lets a reused
         key pass as a legitimate redelivery. */
      if (!created && request.body.kind === 'automated_event') {
        const bodyMismatch = request.body.body !== comment.body
        const reusedKey = request.body.eventType !== comment.eventType || bodyMismatch

        request.log[reusedKey ? 'warn' : 'info'](
          {
            ticketId: request.params.id,
            commentId: comment.id,
            idempotencyKey: request.body.idempotencyKey,
            eventType: request.body.eventType,
            storedEventType: comment.eventType,
            bodyMismatch,
          },
          reusedKey
            ? 'automated event replay absorbed a key reused for a different event'
            : 'automated event replay absorbed',
        )
      }

      reply.status(created ? 201 : 200)
      return comment
    },
  )

  server.post(
    '/api/tickets/:id/submissions',
    {
      config: { policy: TICKET_POLICY },
      bodyLimit: 262_144,
      schema: {
        params: ticketParamsSchema,
        body: createSubmissionBodySchema,
        response: {
          201: submissionSchema,
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
    async (request, reply) => {
      const submission = await service.submit(
        request.params.id,
        request.body,
        requireAuthor(request),
      )
      reply.status(201)
      return submission
    },
  )
}
