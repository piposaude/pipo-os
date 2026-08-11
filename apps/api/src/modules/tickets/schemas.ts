import { z } from 'zod'

export const ticketStatusSchema = z.enum(['open', 'in_progress', 'closed']).meta({
  id: 'TicketStatus',
})

export const ticketSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    description: z.string(),
    status: ticketStatusSchema,
    createdAt: z.string(),
  })
  .meta({ id: 'Ticket' })

export const ticketListResponseSchema = z.array(ticketSchema)

export const ticketParamsSchema = z.object({
  id: z.uuid(),
})

export const createTicketBodySchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    status: ticketStatusSchema.optional(),
  })
  .meta({ id: 'CreateTicketBody' })

const titleField = z.string().min(1)
const descriptionField = z.string().min(1)

export const updateTicketBodySchema = z
  .union([
    z.object({
      title: titleField,
      description: descriptionField.optional(),
      status: ticketStatusSchema.optional(),
    }),
    z.object({
      title: titleField.optional(),
      description: descriptionField,
      status: ticketStatusSchema.optional(),
    }),
    z.object({
      title: titleField.optional(),
      description: descriptionField.optional(),
      status: ticketStatusSchema,
    }),
  ])
  .meta({ id: 'UpdateTicketBody' })

export type TicketStatus = z.infer<typeof ticketStatusSchema>
export type Ticket = z.infer<typeof ticketSchema>
export type TicketParams = z.infer<typeof ticketParamsSchema>
export type CreateTicketBody = z.infer<typeof createTicketBodySchema>
export type UpdateTicketBody = z.infer<typeof updateTicketBodySchema>
