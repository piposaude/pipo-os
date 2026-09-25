import { z } from 'zod'
import { canonicalEnrollmentTypeSchema } from '../tickets/enrollment-type.js'

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

export type PendencyItem = z.infer<typeof pendencyItemSchema>
export type PendencyItemList = z.infer<typeof pendencyItemListSchema>
