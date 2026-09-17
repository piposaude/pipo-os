import { z } from 'zod'
import { memberRoleSchema } from '../groups/schemas.js'
import { emailSchema } from '../../shared/schemas.js'

export const googleLoginQuerySchema = z.object({
  redirect: z.string().optional(),
})

export const googleCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
})

export const viewerGroupSchema = z
  .object({
    groupId: z.uuid(),
    // The same enum the group routes publish: a role spelled twice is a role
    // that the next migration adds to one of them and breaks on the other.
    role: memberRoleSchema,
  })
  .meta({ id: 'AuthMeGroup' })

export const meResponseSchema = z
  .object({
    /** What every author column stores. Equal to the e-mail on the Google login,
     *  and the field to trust anyway: the two can diverge. */
    sub: z.string().nullable(),
    email: emailSchema,
    name: z.string().nullable(),
    policies: z.array(z.string()),
    // Null when the database did not answer: an empty list means the viewer
    // really is in no pod, and the screen reads the two differently.
    groups: z.array(viewerGroupSchema).nullable(),
  })
  .meta({ id: 'AuthMe' })

export type MeResponse = z.infer<typeof meResponseSchema>
