import { z } from 'zod'
import { ticketPrioritySchema, ticketStatusSchema } from './schemas.js'

/** `@me` resolves server-side to the caller; `null` is the unassigned ticket. */
export const assigneeFilterValueSchema = z.union([z.literal('@me'), z.string().min(1), z.null()])

export const vinculoSchema = z
  .enum(['titular', 'dependente', 'grupo-familiar'])
  .meta({ id: 'Vinculo' })

/** Date-only (`YYYY-MM-DD`): compared as strings against day-truncated dates. */
const dateCut = () => z.iso.date()

/**
 * `statuses: [a, b]` matches a or b, and every extra field narrows further.
 * `tags` is the exception: it asks for all the tags listed, not any of them.
 * `urgentBy` matches a ticket that is urgent or already past its action date.
 */
export const ticketFilterSchema = z
  .object({
    statuses: z.array(ticketStatusSchema).optional(),
    companyIds: z.array(z.uuid()).optional(),
    carrierIds: z.array(z.string().min(1)).optional(),
    products: z.array(z.string().min(1)).optional(),
    types: z.array(z.string().min(1)).optional(),
    portes: z.array(z.string().min(1)).optional(),
    /** `null` = no contract in the snapshot, a value the MOV PJ cut needs. */
    contractTypes: z.array(z.string().min(1).nullable()).optional(),
    vinculos: z.array(vinculoSchema).optional(),
    origins: z.array(z.string().min(1)).optional(),
    groupIds: z.array(z.uuid()).optional(),
    tags: z.array(z.string().min(1)).optional(),
    assigneeIds: z.array(assigneeFilterValueSchema).optional(),
    /** `null` = no priority, which the queue shows as "Sem prioridade". */
    priorities: z.array(ticketPrioritySchema.nullable()).optional(),
    actionDateBefore: dateCut().optional(),
    urgentBy: dateCut().optional(),
    createdSince: dateCut().optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'TicketFilter' })

export type AssigneeFilterValue = z.infer<typeof assigneeFilterValueSchema>
export type TicketFilter = z.infer<typeof ticketFilterSchema>
