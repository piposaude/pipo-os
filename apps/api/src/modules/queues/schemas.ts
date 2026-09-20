import { z } from 'zod'
import { ticketFilterSchema } from '../tickets/filter-schema.js'
import { groupBySchema, queueSortSchema } from './view-vocabulary.js'

export const queueSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    /** `null` = team view, edited by the coordination of the group or of an
     *  ancestor. Set = personal view, edited by its owner alone. */
    ownerId: z.string().min(1).nullable(),
    groupId: z.uuid().nullable(),
    filters: ticketFilterSchema.nullable(),
    sort: queueSortSchema,
    groupBy: groupBySchema.nullable(),
    createdBy: z.string(),
    updatedBy: z.string().min(1).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Queue' })

export const queueParamsSchema = z.object({
  id: z.uuid(),
})

export const createQueueBodySchema = z
  .object({
    name: z.string().min(1).max(255),
    /** Only the caller's own id: a view owned by someone else is refused with
     *  403, and the team view is the one that names no owner. */
    ownerId: z.string().min(1).max(255).optional(),
    groupId: z.uuid().optional(),
    filters: ticketFilterSchema.optional(),
    sort: queueSortSchema.optional(),
    groupBy: groupBySchema.optional(),
  })
  .strict()
  .meta({ id: 'CreateQueueBody' })

export const updateQueueBodySchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    ownerId: z.string().min(1).max(255).nullable().optional(),
    groupId: z.uuid().nullable().optional(),
    filters: ticketFilterSchema.optional(),
    sort: queueSortSchema.optional(),
    groupBy: groupBySchema.nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
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

export type Queue = z.infer<typeof queueSchema>
export type QueueParams = z.infer<typeof queueParamsSchema>
export type CreateQueueBody = z.infer<typeof createQueueBodySchema>
export type UpdateQueueBody = z.infer<typeof updateQueueBodySchema>
export type ListQueuesQuery = z.infer<typeof listQueuesQuerySchema>
export type QueueList = z.infer<typeof queueListSchema>
export type ListQueueTicketsQuery = z.infer<typeof listQueueTicketsQuerySchema>
