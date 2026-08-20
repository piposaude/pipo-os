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

export const ticketSchema = z
  .object({
    id: z.uuid(),
    enrollmentId: z.uuid(),
    enrollmentType: z.string(),
    status: ticketStatusSchema,
    queueId: z.uuid().nullable(),
    assigneeId: z.uuid().nullable(),
    companyId: z.uuid(),
    tags: z.array(z.string()),
    forceCompletion: z.boolean(),
    enrollmentSnapshot: z.record(z.string(), z.unknown()),
    sourceSystem: z.string(),
    parentTicketId: z.uuid().nullable(),
    closedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
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
    status: ticketStatusSchema.optional(),
    queueId: z.uuid().optional(),
    assigneeId: z.uuid().optional(),
    tags: z.array(z.string()).optional(),
    forceCompletion: z.boolean().optional(),
    parentTicketId: z.uuid().optional(),
  })
  .meta({ id: 'CreateTicketBody' })

export const updateTicketBodySchema = z
  .object({
    status: ticketStatusSchema.optional(),
    queueId: z.uuid().nullable().optional(),
    assigneeId: z.uuid().nullable().optional(),
    tags: z.array(z.string()).optional(),
    forceCompletion: z.boolean().optional(),
    closedAt: z.iso.datetime({ offset: true }).nullable().optional(),
    parentTicketId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' })
  .meta({ id: 'UpdateTicketBody', minProperties: 1 })

export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  queueId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
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
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>
export type TicketList = z.infer<typeof ticketListSchema>
