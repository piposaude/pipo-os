import { z } from 'zod'
import { ticketFilterSchema } from '../tickets/filter-schema.js'

export const queueSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    filters: ticketFilterSchema.nullable(),
    createdBy: z.string(),
    updatedBy: z.string().min(1).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Queue' })

export const errorResponseSchema = z
  .object({ error: z.string(), message: z.string() })
  .meta({ id: 'ErrorResponse' })

export const queueParamsSchema = z.object({
  id: z.uuid(),
})

export const createQueueBodySchema = z
  .object({
    name: z.string().min(1).max(255),
    filters: ticketFilterSchema.optional(),
  })
  .strict()
  .meta({ id: 'CreateQueueBody' })

export const updateQueueBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    filters: ticketFilterSchema.optional(),
  })
  .strict()
  .refine((d) => d.name !== undefined || d.filters !== undefined, {
    message: 'At least one field is required',
  })
  .meta({ id: 'UpdateQueueBody' })

export const listQueuesQuerySchema = z.object({
  name: z.string().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const queueListSchema = z
  .object({
    data: z.array(queueSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ id: 'QueueList' })

export const listQueueTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const queueGroupParamsSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
})

export const addQueueGroupBodySchema = z
  .object({ groupId: z.uuid() })
  .strict()
  .meta({ id: 'AddQueueGroupBody' })

export const queueGroupSchema = z
  .object({
    queueId: z.uuid(),
    groupId: z.uuid(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'QueueGroup' })

export type Queue = z.infer<typeof queueSchema>
export type QueueParams = z.infer<typeof queueParamsSchema>
export type CreateQueueBody = z.infer<typeof createQueueBodySchema>
export type UpdateQueueBody = z.infer<typeof updateQueueBodySchema>
export type ListQueuesQuery = z.infer<typeof listQueuesQuerySchema>
export type QueueList = z.infer<typeof queueListSchema>
export type ListQueueTicketsQuery = z.infer<typeof listQueueTicketsQuerySchema>
export type QueueGroup = z.infer<typeof queueGroupSchema>
export type QueueGroupParams = z.infer<typeof queueGroupParamsSchema>
