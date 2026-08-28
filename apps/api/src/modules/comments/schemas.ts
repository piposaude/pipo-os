import { z } from 'zod'

export const commentSchema = z
  .object({
    id: z.uuid(),
    ticketId: z.uuid(),
    kind: z.enum(['manual', 'automated_event']),
    channel: z.enum(['internal', 'email']),
    visibility: z.enum(['public', 'private']),
    eventType: z.string().nullable(),
    authorId: z.string().nullable(),
    body: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
  })
  .meta({ id: 'TicketComment' })

export const createCommentBodySchema = z
  .object({
    visibility: z.enum(['public', 'private']),
    body: z.string().min(1),
  })
  .strict()
  .meta({ id: 'CreateCommentBody' })

export const commentListSchema = z
  .object({
    data: z.array(commentSchema),
  })
  .meta({ id: 'CommentList' })

export const errorResponseSchema = z
  .object({ error: z.string(), message: z.string() })
  .meta({ id: 'ErrorResponse' })

export type Comment = z.infer<typeof commentSchema>
export type CreateCommentBody = z.infer<typeof createCommentBodySchema>
export type CommentList = z.infer<typeof commentListSchema>
