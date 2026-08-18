import { z } from 'zod'

export const ticketStatusSchema = z.string().meta({ id: 'TicketStatus' })

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

export type TicketStatus = z.infer<typeof ticketStatusSchema>
export type Ticket = z.infer<typeof ticketSchema>
export type TicketParams = z.infer<typeof ticketParamsSchema>
export type CreateTicketBody = z.infer<typeof createTicketBodySchema>
