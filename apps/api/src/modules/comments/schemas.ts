import { z } from 'zod'
import { serviceEventTypeSchema, ticketEventTypeSchema } from './event-types.js'

/* The three the CHECK of migration 0030 allows. `system` is wider than
   `Author['type']` on purpose, for the row no person and no service asked
   for. */
const authorTypeSchema = z.enum(['user', 'service', 'system'])

export const commentSchema = z
  .object({
    id: z.uuid(),
    ticketId: z.uuid(),
    kind: z.enum(['manual', 'automated_event']),
    channel: z.enum(['internal', 'email']),
    visibility: z.enum(['public', 'private']),
    eventType: ticketEventTypeSchema.nullable(),
    authorId: z.string().nullable(),
    authorType: authorTypeSchema,
    body: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
  })
  .meta({ id: 'TicketComment' })

/** The events the catalog names carry a handful of fields — an e-mail, a
 *  document type, a status. The ceiling is here because nothing else caps it:
 *  `body` stops at 50k characters and metadata would only meet the route's
 *  256 KB, in a jsonb column the chronology hands back verbatim, 200 rows at
 *  a time. */
export const METADATA_MAX_BYTES = 8_192

const metadataSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Buffer.byteLength(JSON.stringify(value)) <= METADATA_MAX_BYTES, {
    message: `Metadata must serialise to at most ${METADATA_MAX_BYTES} bytes`,
  })
  .default({})
  /* A refine is not expressible in JSON Schema, so the published contract
     would promise no limit at all without this line. */
  .describe(`Free-form event data, at most ${METADATA_MAX_BYTES} bytes serialised`)

const commentBodyBase = {
  visibility: z.enum(['public', 'private']),
  body: z.string().trim().min(1).max(50_000),
}

export const createManualCommentBodySchema = z
  .object({
    ...commentBodyBase,
    /* Optional in the contract and filled in by the route: every caller today
       sends a body with no `kind` at all. */
    kind: z.literal('manual').default('manual'),
  })
  .strict()
  .meta({ id: 'CreateManualCommentBody' })

/**
 * What a service says happened to the ticket. `visibility` is stated and never
 * inferred: the HR answer belongs to the public cut and the note the EI writes
 * to itself does not, and reading it off the event type would put one of them
 * on the wrong side.
 */
export const createAutomatedEventBodySchema = z
  .object({
    ...commentBodyBase,
    kind: z.literal('automated_event'),
    /* The service half of the catalog only: `assigned` and the other three the
       API records about its own writes have no legitimate caller out here. */
    eventType: serviceEventTypeSchema,
    metadata: metadataSchema,
    /* The EI writes from a Kafka consumer, where redelivery is ordinary: the
       key is what makes the second pass find the first row instead of adding
       a second one. */
    idempotencyKey: z.string().trim().min(1).max(255).optional(),
  })
  .strict()
  .meta({ id: 'CreateAutomatedEventBody' })

export const createCommentBodySchema = z
  .discriminatedUnion('kind', [createManualCommentBodySchema, createAutomatedEventBodySchema])
  .meta({ id: 'CreateCommentBody' })

/**
 * Fills the discriminator that a body without `kind` is missing. Zod 4 refuses
 * the union before reaching the `manual` default — with no branch chosen there
 * is no default to read — and a `preprocess` around the union would drop the
 * required keys from the exported contract, the lesson
 * `tickets/enrollment-type.ts` already paid for. So the route does it in
 * `preValidation`, where the body is still untrusted and anything that is not
 * a plain object passes through for the schema to refuse.
 */
export function withDefaultKind(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body
  if ('kind' in body) return body

  return { ...body, kind: 'manual' }
}

export const commentListSchema = z
  .object({
    data: z.array(commentSchema),
  })
  .meta({ id: 'CommentList' })

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
  /* On all three variants because the front tells a line someone wrote from a
     line the automation left, and the author id alone does not say which —
     `svc:` is a prefix, not a type. */
  authorType: authorTypeSchema,
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
    /* The whole catalog, not just the service half: this side also renders the
       events the API records itself. Never null — an item is only an event
       because its row carries a type. */
    eventType: ticketEventTypeSchema,
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
  /* Only `public` narrows; absent means the analyst view, which sees all.
     A status change carries no visibility of its own and stays out of the
     public cut — see the note on the query in the repository. */
  visibility: z.enum(['public']).optional(),
})

export type TimelineItem = z.infer<typeof timelineItemSchema>
export type Timeline = z.infer<typeof timelineSchema>
export type TimelineQuery = z.infer<typeof timelineQuerySchema>

export type Comment = z.infer<typeof commentSchema>
export type CreateCommentBody = z.infer<typeof createCommentBodySchema>
export type CreateManualCommentBody = z.infer<typeof createManualCommentBodySchema>
export type CreateAutomatedEventBody = z.infer<typeof createAutomatedEventBodySchema>
export type CommentList = z.infer<typeof commentListSchema>
