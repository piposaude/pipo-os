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
    body: z.string().trim().min(1),
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

/**
 * The unified chronology of a ticket: manual comments and automated events
 * from `ticket_comments`, status changes from `ticket_status_history`.
 *
 * Every field of every variant must be declared here. The zod encoder drops
 * keys a response schema does not name, so an omission here disappears from
 * the payload silently, with no error at any layer.
 */
const timelineItemBase = {
  id: z.uuid(),
  ticketId: z.uuid(),
  authorId: z.string().nullable(),
  createdAt: z.string(),
}

export const timelineCommentSchema = z
  .object({
    ...timelineItemBase,
    type: z.literal('comment'),
    channel: z.enum(['internal', 'email']),
    visibility: z.enum(['public', 'private']),
    body: z.string(),
  })
  .meta({ id: 'TimelineComment' })

export const timelineEventSchema = z
  .object({
    ...timelineItemBase,
    type: z.literal('event'),
    eventType: z.string().nullable(),
    body: z.string(),
    metadata: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'TimelineEvent' })

export const timelineStatusChangeSchema = z
  .object({
    ...timelineItemBase,
    type: z.literal('status-changed'),
    fromStatus: z.string(),
    toStatus: z.string(),
    reason: z.string().nullable(),
    authorType: z.string(),
  })
  .meta({ id: 'TimelineStatusChange' })

export const timelineItemSchema = z
  .discriminatedUnion('type', [
    timelineCommentSchema,
    timelineEventSchema,
    timelineStatusChangeSchema,
  ])
  .meta({ id: 'TimelineItem' })

export const timelineSchema = z
  .object({
    data: z.array(timelineItemSchema),
    /* Absent means the chronology ended — not "start over". */
    nextCursor: z.string().optional(),
  })
  .meta({ id: 'Timeline' })

export const TIMELINE_PAGE_SIZE = 50

export const timelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(TIMELINE_PAGE_SIZE),
  /* Opaque on purpose: base64 of "<created_at>|<id>". Keeping clients from
     reading it is what lets the keyset change without breaking them. */
  cursor: z.string().min(1).optional(),
})

export type TimelineItem = z.infer<typeof timelineItemSchema>
export type Timeline = z.infer<typeof timelineSchema>
export type TimelineQuery = z.infer<typeof timelineQuerySchema>

export type Comment = z.infer<typeof commentSchema>
export type CreateCommentBody = z.infer<typeof createCommentBodySchema>
export type CommentList = z.infer<typeof commentListSchema>
