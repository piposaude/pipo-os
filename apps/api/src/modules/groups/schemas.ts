import { z } from 'zod'

/** `"   "` satisfies the `minLength: 1` that OpenAPI can express and fails the
 *  `.trim()` that it cannot — hence the description. */
const trimmedInput = (): z.ZodString =>
  z.string().trim().min(1).describe('Trimmed before validation: whitespace only is rejected.')

export const companyIdsSchema = z
  .array(z.uuid())
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'Company ids must be unique' })

export const groupSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    parentId: z.uuid().nullable(),
    createdBy: z.string(),
    updatedBy: z.string().min(1).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({
    id: 'Group',
    description:
      'The group by itself: POST and PATCH answer with this shape. Only GroupDetail, from the read routes and the portfolio writes, carries companyIds and members.',
  })

/** Must stay the pair the CHECK of migration 0024 admits. */
export const memberRoleSchema = z.enum(['admin', 'member']).meta({ id: 'GroupMemberRole' })

/** Response only, so no `trimmedInput()` here: trimming on the way out would
 *  hide a bad row instead of rejecting it on the way in. */
export const groupMemberSchema = z
  .object({
    groupId: z.uuid(),
    userId: z.string().min(1),
    role: memberRoleSchema,
    active: z.boolean(),
    companyIds: z.array(z.uuid()),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'GroupMember' })

export const groupDetailMemberSchema = z
  .object({
    userId: z.string().min(1),
    role: memberRoleSchema,
    active: z.boolean(),
    companyIds: z.array(z.uuid()),
  })
  .meta({ id: 'GroupDetailMember' })

export const groupDetailSchema = groupSchema
  .extend({
    companyIds: z.array(z.uuid()),
    members: z.array(groupDetailMemberSchema),
  })
  .meta({ id: 'GroupDetail' })

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

export const companyParamsSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
})

export const createGroupBodySchema = z
  .object({
    name: trimmedInput().max(255),
    parentId: z.uuid().nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateGroupBody' })

export const updateGroupBodySchema = z
  .object({
    name: trimmedInput().max(255).optional(),
    parentId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine((d) => d.name !== undefined || d.parentId !== undefined, {
    message: 'At least one field is required',
  })
  .meta({ id: 'UpdateGroupBody' })

export const addMemberBodySchema = z
  .object({
    userId: trimmedInput().max(255),
    role: memberRoleSchema.optional(),
    companyIds: companyIdsSchema.optional(),
  })
  .strict()
  .meta({ id: 'AddGroupMemberBody' })

export const updateMemberBodySchema = z
  .object({
    active: z.boolean().optional(),
    role: memberRoleSchema.optional(),
    companyIds: companyIdsSchema.optional(),
  })
  .strict()
  .refine((d) => d.active !== undefined || d.role !== undefined || d.companyIds !== undefined, {
    message: 'At least one field is required',
  })
  .meta({ id: 'UpdateGroupMemberBody' })

export const replaceCompaniesBodySchema = z
  .object({ companyIds: companyIdsSchema })
  .strict()
  .meta({ id: 'ReplaceGroupCompaniesBody' })

export const listGroupsQuerySchema = z.object({
  name: z.string().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const groupListSchema = z
  .object({
    data: z.array(groupDetailSchema),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .meta({ id: 'GroupList' })

export type Group = z.infer<typeof groupSchema>
export type GroupDetail = z.infer<typeof groupDetailSchema>
export type GroupDetailMember = z.infer<typeof groupDetailMemberSchema>
export type MemberRole = z.infer<typeof memberRoleSchema>
export type GroupMember = z.infer<typeof groupMemberSchema>
export type GroupParams = z.infer<typeof groupParamsSchema>
export type MemberParams = z.infer<typeof memberParamsSchema>
export type CreateGroupBody = z.infer<typeof createGroupBodySchema>
export type UpdateGroupBody = z.infer<typeof updateGroupBodySchema>
export type AddMemberBody = z.infer<typeof addMemberBodySchema>
export type UpdateMemberBody = z.infer<typeof updateMemberBodySchema>
export type ReplaceCompaniesBody = z.infer<typeof replaceCompaniesBodySchema>
export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>
export type GroupList = z.infer<typeof groupListSchema>
