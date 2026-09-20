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
    /** The viewer's own star, not who else starred it: the Favorites section
     *  is always "mine", and publishing the list is nobody's business. */
    favorite: z.boolean(),
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
     *  403, and `null` is the team view, same as leaving it out. */
    ownerId: z.string().min(1).max(255).nullable().optional(),
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
  favorite: z.stringbool().optional(),
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

/** Repeated parameter, as the rows query does it: `?ids=a&ids=b`. The ceiling
 *  is the sidebar's, which never shows fifty views at once. */
export const queueCountsQuerySchema = z.object({
  ids: z.preprocess(
    (raw) => (raw === undefined ? undefined : Array.isArray(raw) ? raw : [raw]),
    z.array(z.uuid()).min(1).max(50),
  ),
})

export const queueCountsSchema = z
  .object({
    data: z.array(z.object({ queueId: z.uuid(), total: z.number().int() })),
  })
  .meta({ id: 'QueueCounts' })

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
export type QueueCountsQuery = z.infer<typeof queueCountsQuerySchema>
export type QueueCounts = z.infer<typeof queueCountsSchema>
