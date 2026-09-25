import { z } from 'zod'
import { canonicalEnrollmentTypeSchema } from '../tickets/enrollment-type.js'

export const PENDENCY_ACTIONS = ['opened', 'reopened', 'resolved'] as const

export type PendencyAction = (typeof PENDENCY_ACTIONS)[number]

export const pendencyCategorySchema = z
  .enum(['document', 'signature', 'correction', 'data'])
  .meta({ id: 'PendencyCategory' })

export const pendencyItemSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    category: pendencyCategorySchema,
    enrollmentType: canonicalEnrollmentTypeSchema.nullable(),
  })
  .meta({
    id: 'PendencyItem',
    description: 'Um item que a analista pode cobrar. enrollmentType null vale para qualquer tipo.',
  })

export const pendencyItemListSchema = z
  .object({
    data: z.array(pendencyItemSchema),
  })
  .meta({ id: 'PendencyItemList' })

export const listPendencyItemsQuerySchema = z.object({
  /* A string and not the canonical enum: the ticket column still holds
     legacy words, and the drawer passes the ticket's own. */
  enrollmentType: z
    .string()
    .min(1)
    .optional()
    .describe('Só os itens deste tipo e os que valem para qualquer tipo'),
})

export const openPendencySchema = z
  .object({
    itemId: z.string(),
    since: z.iso.datetime({ offset: true }).describe('Quando o ciclo atual abriu'),
    chargedCount: z.number().int().min(1).describe('Cobranças desde que o ciclo abriu'),
  })
  .meta({ id: 'OpenPendency' })

export type OpenPendency = z.infer<typeof openPendencySchema>
export type PendencyItem = z.infer<typeof pendencyItemSchema>
export type PendencyItemList = z.infer<typeof pendencyItemListSchema>
