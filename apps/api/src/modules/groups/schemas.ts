import { z } from 'zod'

/** `"   "` satisfies the `minLength: 1` that OpenAPI can express and fails the
 *  `.trim()` that it cannot — hence the description. */
const trimmedInput = (): z.ZodString =>
  z.string().trim().min(1).describe('Trimmed before validation: whitespace only is rejected.')

export const groupSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    createdBy: z.string(),
    updatedBy: z.string().min(1).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Group' })

/** Response only, so no `trimmedInput()` here: trimming on the way out would
 *  hide a bad row instead of rejecting it on the way in. */
export const groupMemberSchema = z
  .object({
    groupId: z.uuid(),
    userId: z.string().min(1),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'GroupMember' })

export const errorResponseSchema = z
  .object({ error: z.string(), message: z.string() })
  .meta({ id: 'ErrorResponse' })

export const groupParamsSchema = z.object({
  id: z.uuid(),
})

export const memberParamsSchema = z.object({
  id: z.uuid(),
  /** `.trim()` before `.min(1)`: `min` counts characters and a space is one,
   *  so `"   "` was a valid member id that no query could ever match. No `.max`:
   *  the router's `maxParamLength` in app.ts answers 414 before Zod runs. */
  memberId: trimmedInput(),
})

export const createGroupBodySchema = z
  .object({
    name: trimmedInput().max(255),
  })
  .strict()
  .meta({ id: 'CreateGroupBody' })

export const updateGroupBodySchema = z
  .object({
    name: trimmedInput().max(255),
  })
  .strict()
  .meta({ id: 'UpdateGroupBody' })

export const addMemberBodySchema = z
  .object({
    userId: trimmedInput().max(255),
  })
  .strict()
  .meta({ id: 'AddGroupMemberBody' })

export const updateMemberBodySchema = z
  .object({
    active: z.boolean(),
  })
  .strict()
  .meta({ id: 'UpdateGroupMemberBody' })

export const listGroupsQuerySchema = z.object({
  name: z.string().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const groupListSchema = z
  .object({
    data: z.array(groupSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ id: 'GroupList' })

export type Group = z.infer<typeof groupSchema>
export type GroupMember = z.infer<typeof groupMemberSchema>
export type GroupParams = z.infer<typeof groupParamsSchema>
export type MemberParams = z.infer<typeof memberParamsSchema>
export type CreateGroupBody = z.infer<typeof createGroupBodySchema>
export type UpdateGroupBody = z.infer<typeof updateGroupBodySchema>
export type AddMemberBody = z.infer<typeof addMemberBodySchema>
export type UpdateMemberBody = z.infer<typeof updateMemberBodySchema>
export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>
export type GroupList = z.infer<typeof groupListSchema>
