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
    closedAt: z.string().nullable().optional(),
    parentTicketId: z.uuid().nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' })
  .meta({ id: 'UpdateTicketBody' })

export const formValueSchema = z
  .object({
    id: z.uuid(),
    ticketId: z.uuid(),
    fieldKey: z.string(),
    fieldValue: z.unknown(),
    updatedBy: z.uuid().nullable(),
    updatedAt: z.string(),
  })
  .meta({ id: 'FormValue' })

export const patchFormValuesBodySchema = z
  .array(
    z.object({
      fieldKey: z.string().min(1),
      fieldValue: z.unknown(),
      updatedBy: z.uuid().optional(),
    }),
  )
  .min(1)
  .meta({ id: 'PatchFormValuesBody' })

export type TicketStatus = z.infer<typeof ticketStatusSchema>
export type Ticket = z.infer<typeof ticketSchema>
export type TicketParams = z.infer<typeof ticketParamsSchema>
export type CreateTicketBody = z.infer<typeof createTicketBodySchema>
export type UpdateTicketBody = z.infer<typeof updateTicketBodySchema>
export type FormValue = z.infer<typeof formValueSchema>
export type PatchFormValuesBody = z.infer<typeof patchFormValuesBodySchema>
