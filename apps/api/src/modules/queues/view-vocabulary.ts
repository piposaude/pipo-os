import { z } from 'zod'

/** Pinned to contract/ticket-queue-view.json by the contract test beside this
 *  file; schema.test.ts holds the CHECKs of migration 0027 to the same list. */
export const SORT_FIELDS = ['actionDate', 'createdAt', 'updatedAt', 'company', 'status'] as const
export const SORT_DIRECTIONS = ['asc', 'desc'] as const
export const GROUP_BY_VALUES = ['status', 'company', 'product', 'assignee', 'none'] as const

export const sortFieldSchema = z.enum(SORT_FIELDS)
export const sortDirectionSchema = z.enum(SORT_DIRECTIONS)

export const queueSortSchema = z
  .object({ by: sortFieldSchema, direction: sortDirectionSchema })
  .meta({ id: 'QueueSort' })

/** `null` is "this view imposes no grouping", which is not `'none'`, "this view
 *  imposes a flat list". */
export const groupBySchema = z.enum(GROUP_BY_VALUES).meta({ id: 'QueueGroupBy' })

export type SortField = z.infer<typeof sortFieldSchema>
export type SortDirection = z.infer<typeof sortDirectionSchema>
export type QueueSort = z.infer<typeof queueSortSchema>
export type QueueGroupBy = z.infer<typeof groupBySchema>
