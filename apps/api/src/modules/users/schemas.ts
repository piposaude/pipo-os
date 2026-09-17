import { z } from 'zod'
import { emailSchema } from '../../shared/schemas.js'

export const userSummarySchema = z
  .object({
    email: emailSchema,
    name: z.string().nullable(),
  })
  .meta({
    id: 'UserSummary',
    description:
      'A Pipo member. The e-mail is the join key: it is what the session `sub` writes into assigneeId, createdBy and comment authors.',
  })

export const userListSchema = z
  .object({
    data: z.array(userSummarySchema),
  })
  .meta({
    id: 'UserList',
    description:
      'Every Pipo member, unpaginated on purpose: the queue needs the whole e-mail to name map to draw a page of tickets. Bounded at 5.000 by the client that fills it.',
  })

export const listUsersQuerySchema = z.object({
  /** `search`, like GET /api/tickets: the name spelled elsewhere would also miss
   *  the log redaction that covers a person-typed term. */
  search: z.string().trim().max(255).optional(),
})

/** `true` is text a person types, so it must leave `req.url`. Crossed with the
 *  redaction list in `rows-redaction.test.ts`. */
export const USERS_QUERY_FIELD_PII = {
  search: true,
} satisfies Record<keyof ListUsersQuery, true | string>

export type UserSummary = z.infer<typeof userSummarySchema>
export type UserList = z.infer<typeof userListSchema>
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>
