import { z } from 'zod'
import { emailSchema, errorResponseSchema } from '../../shared/schemas.js'
import {
  alterationTypeSchema,
  incomingEnrollmentTypeSchema,
  type CanonicalEnrollmentType,
} from './enrollment-type.js'

export const ticketStatusSchema = z
  .enum([
    'broker-processing',
    'carrier-processing',
    'broker-open-issue',
    'missing-documents',
    'incorrect-data',
    'completed',
    'cancelled',
    'submitted-cancellation',
  ])
  .meta({ id: 'TicketStatus' })

export const CLOSED_STATUSES = new Set<z.infer<typeof ticketStatusSchema>>([
  'completed',
  'cancelled',
])

export const relationshipSchema = z
  .enum(['holder', 'dependent', 'family-group'])
  .meta({ id: 'Relationship' })

export const ticketPrioritySchema = z
  .enum(['urgent', 'high', 'medium', 'low'])
  .meta({ id: 'TicketPriority' })

export const ticketPersonSchema = z
  .object({
    email: emailSchema,
    name: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    preferredChannel: z.enum(['platform', 'email']).optional(),
  })
  .meta({ id: 'TicketPerson' })

export const ticketSchema = z
  .object({
    id: z.uuid(),
    displayNumber: z.string(),
    title: z.string().nullable(),
    enrollmentId: z.uuid(),
    enrollmentType: z.string(),
    status: ticketStatusSchema,
    priority: ticketPrioritySchema.nullable(),
    actionDate: z.iso.datetime({ offset: true }).nullable(),
    queueId: z.uuid().nullable(),
    groupId: z.uuid().nullable(),
    assigneeId: z.string().min(1).nullable(),
    companyId: z.uuid(),
    tags: z.array(z.string()),
    pendingDocumentation: z.array(z.string()),
    requester: ticketPersonSchema.nullable(),
    collaborators: z.array(ticketPersonSchema),
    forceCompletion: z.boolean(),
    enrollmentSnapshot: z.record(z.string(), z.unknown()),
    /** `.min(1)` as in `assigneeId`: a word or null, and `''` is neither —
     *  both write paths already refuse it. */
    carrierId: z.string().min(1).nullable(),
    carrierName: z.string().min(1).nullable(),
    product: z.string().min(1).nullable(),
    contractType: z.string().min(1).nullable(),
    companySize: z.string().min(1).nullable(),
    relationship: relationshipSchema.nullable(),
    sourceSystem: z.string(),
    origin: z.string().min(1).nullable(),
    parentTicketId: z.uuid().nullable(),
    closedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'Ticket' })

export const ticketParamsSchema = z.object({
  id: z.uuid(),
})

/** Classification only, never a person: no space and no accent is what makes
 *  the `tags` entry in `ROW_FIELD_PII` a fact instead of a convention. */
const tagSchema = z.string().regex(/^[a-z0-9_:-]+$/)

export const createTicketBodySchema = z
  .object({
    enrollmentId: z.uuid(),
    // Closed on the way in and open on the way out (`ticketSchema` stays a
    // string), because the column holds legacy words.
    enrollmentType: incomingEnrollmentTypeSchema,
    // Only read next to `alteration`; the snapshot's alteration_type fills it
    // when the body does not say.
    alterationType: alterationTypeSchema.optional(),
    companyId: z.uuid(),
    sourceSystem: z.string(),
    enrollmentSnapshot: z.record(z.string(), z.unknown()),
    title: z.string().min(1).max(500).optional(),
    // With an offset, always: a date alone would have to guess a timezone, and
    // the guess moves the day the queue shows.
    actionDate: z.iso.datetime({ offset: true }).optional(),
    // How the ticket came in, not which system created it — that is
    // sourceSystem. Absent stays null: a default would label a failure normal.
    origin: z.string().min(1).optional(),
    // Strict on the way in and not on the way out: a caller typo must fail
    // loudly, a hand-edited row must not 500 the whole read.
    requester: ticketPersonSchema.strict().optional(),
    collaborators: z.array(ticketPersonSchema.strict()).max(50).optional(),
    carrierId: z.string().min(1).optional(),
    carrierName: z.string().min(1).optional(),
    product: z.string().min(1).optional(),
    contractType: z.string().min(1).optional(),
    companySize: z.string().min(1).optional(),
    // Accepted, never chosen: routing by portfolio is PD-052.
    groupId: z.uuid().optional(),
    queueId: z.uuid().optional(),
    assigneeId: z.string().min(1).optional(),
    tags: z.array(tagSchema).optional(),
    forceCompletion: z.boolean().optional(),
    parentTicketId: z.uuid().optional(),
  })
  .meta({ id: 'CreateTicketBody' })

// Status lives only in PATCH /:id/status, which audits the change and refuses
// a closed ticket. Accepting it here was a second, unaudited door (DSP-19).
export const updateTicketBodySchema = z
  .object({
    queueId: z.uuid().nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    tags: z.array(tagSchema).optional(),
    forceCompletion: z.boolean().optional(),
    parentTicketId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' })
  .meta({ id: 'UpdateTicketBody', minProperties: 1 })

export const updateTicketStatusBodySchema = z
  .object({
    status: ticketStatusSchema,
    reason: z.string().min(1).optional(),
  })
  .strict()
  .meta({ id: 'UpdateTicketStatusBody' })

export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  enrollmentId: z.uuid().optional(),
  queueId: z.uuid().optional(),
  assigneeId: z.string().min(1).optional(),
  enrollmentType: z
    .string()
    .describe('Compara a palavra exatamente; o vocabulário gravado é minúsculo')
    .optional(),
  sourceSystem: z.string().optional(),
  companyId: z.uuid().optional(),
  tags: z
    .preprocess((v) => (typeof v === 'string' ? (v ? [v] : []) : v), z.array(z.string()))
    .describe('Filtra tickets que contenham ao menos uma das tags informadas (OR)')
    .optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>

/** Every query parameter of `GET /tickets`, classified as in `QUERY_FIELD_PII`:
 *  `true` is text a person types, so it must leave `req.url`. */
export const LIST_QUERY_FIELD_PII = {
  status: 'closed vocabulary',
  enrollmentId: 'internal uuid',
  queueId: 'internal uuid',
  assigneeId: 'Pipo user id, not the beneficiary — ACE-196',
  enrollmentType: 'closed vocabulary',
  sourceSystem: 'closed vocabulary',
  companyId: 'internal uuid',
  tags: 'a label picked from the queue, never typed free — ACE-196',
  // Matches `name` and `tax_id` inside the snapshot, so it is typed as either.
  search: true,
  page: 'number',
  pageSize: 'number',
} satisfies Record<keyof ListTicketsQuery, true | string>

export const openTicketConflictSchema = errorResponseSchema
  .extend({ ticketId: z.uuid().optional() })
  .meta({ id: 'OpenTicketConflict' })

export const ticketListSchema = z
  .object({
    data: z.array(ticketSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ id: 'TicketList' })

export type TicketStatus = z.infer<typeof ticketStatusSchema>
export type Ticket = z.infer<typeof ticketSchema>
export type TicketParams = z.infer<typeof ticketParamsSchema>
export type CreateTicketBody = z.infer<typeof createTicketBodySchema>
/** What the repository writes: the body after the service translated the
 *  type, so `alteration` cannot reach the column by construction. */
export type CreateTicketData = Omit<CreateTicketBody, 'enrollmentType' | 'alterationType'> & {
  enrollmentType: CanonicalEnrollmentType
}
export type UpdateTicketBody = z.infer<typeof updateTicketBodySchema>
export type UpdateTicketStatusBody = z.infer<typeof updateTicketStatusBodySchema>
export type TicketList = z.infer<typeof ticketListSchema>
