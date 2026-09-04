import { z } from 'zod'

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
    requester: z.record(z.string(), z.unknown()).nullable(),
    collaborators: z.array(z.record(z.string(), z.unknown())),
    forceCompletion: z.boolean(),
    enrollmentSnapshot: z.record(z.string(), z.unknown()),
    /** `.min(1)` as in `assigneeId`: a word or null, and `''` is neither.
     *  Both write paths already refuse it — the body by the same `.min(1)`,
     *  the snapshot by ignoring blanks. */
    carrierId: z.string().min(1).nullable(),
    carrierName: z.string().min(1).nullable(),
    product: z.string().min(1).nullable(),
    contractType: z.string().min(1).nullable(),
    companySize: z.string().min(1).nullable(),
    relationship: relationshipSchema.nullable(),
    sourceSystem: z.string(),
    parentTicketId: z.uuid().nullable(),
    closedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'Ticket' })

export const errorResponseSchema = z
  .object({ error: z.string(), message: z.string() })
  .meta({ id: 'ErrorResponse' })

export const ticketParamsSchema = z.object({
  id: z.uuid(),
})

export const createTicketBodySchema = z
  .object({
    enrollmentId: z.uuid(),
    enrollmentType: z.string(),
    companyId: z.uuid(),
    sourceSystem: z.string(),
    enrollmentSnapshot: z.record(z.string(), z.unknown()),
    carrierId: z.string().min(1).optional(),
    carrierName: z.string().min(1).optional(),
    product: z.string().min(1).optional(),
    contractType: z.string().min(1).optional(),
    companySize: z.string().min(1).optional(),
    status: ticketStatusSchema.optional(),
    queueId: z.uuid().optional(),
    assigneeId: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    forceCompletion: z.boolean().optional(),
    parentTicketId: z.uuid().optional(),
  })
  .meta({ id: 'CreateTicketBody' })

export const updateTicketBodySchema = z
  .object({
    status: ticketStatusSchema.optional(),
    queueId: z.uuid().nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    tags: z.array(z.string()).optional(),
    forceCompletion: z.boolean().optional(),
    closedAt: z.iso.datetime({ offset: true }).nullable().optional(),
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
  queueId: z.uuid().optional(),
  assigneeId: z.string().min(1).optional(),
  enrollmentType: z.string().optional(),
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
export type UpdateTicketBody = z.infer<typeof updateTicketBodySchema>
export type UpdateTicketStatusBody = z.infer<typeof updateTicketStatusBodySchema>
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>
export type TicketList = z.infer<typeof ticketListSchema>
