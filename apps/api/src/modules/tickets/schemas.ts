import { z } from 'zod'

export const ticketStatusSchema = z.enum(['open', 'in_progress', 'closed'])

export const ticketSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  status: ticketStatusSchema,
  createdAt: z.string(),
})

export const ticketListResponseSchema = z.array(ticketSchema)

export const ticketParamsSchema = z.object({
  id: z.uuid(),
})

export const createTicketBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  status: ticketStatusSchema.optional(),
})

export const updateTicketBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  status: ticketStatusSchema.optional(),
})

export type TicketStatus = z.infer<typeof ticketStatusSchema>
export type Ticket = z.infer<typeof ticketSchema>
export type TicketParams = z.infer<typeof ticketParamsSchema>
export type CreateTicketBody = z.infer<typeof createTicketBodySchema>
export type UpdateTicketBody = z.infer<typeof updateTicketBodySchema>
