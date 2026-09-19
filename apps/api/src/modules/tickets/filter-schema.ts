import { z } from 'zod'
import { relationshipSchema, ticketPrioritySchema, ticketStatusSchema } from './schemas.js'

/** Rejects `''` — an option nobody can select. */
const nonEmptyText = z.string().min(1)

/** `null` is the unassigned ticket. `@me` is a plain string the web client
 *  resolves to the viewer; the server-side resolver is PD-043. */
export const assigneeFilterValueSchema = nonEmptyText.nullable()

/** Date-only (`YYYY-MM-DD`): compared as strings against day-truncated dates. */
const dateCut = z.iso.date()

/**
 * `statuses: [a, b]` matches a or b, and every extra field narrows further.
 * `tags` is the exception: it asks for all the tags listed, not any of them.
 * `urgentBy` matches a ticket that is urgent or already past its action date.
 */
export const ticketFilterSchema = z
  .object({
    statuses: z.array(ticketStatusSchema).min(1).optional(),
    /** Matches the ticket's own company or the parent it is a branch of, so a
     *  cut by client covers the whole group (DSP-36). */
    companyIds: z.array(z.uuid()).min(1).optional(),
    carrierIds: z.array(nonEmptyText).min(1).optional(),
    products: z.array(nonEmptyText).min(1).optional(),
    types: z
      .array(nonEmptyText)
      .min(1)
      .describe('Compara a palavra exatamente; o vocabulário gravado é minúsculo')
      .optional(),
    companySizes: z.array(nonEmptyText).min(1).optional(),
    /** `null` = no contract in the snapshot, a value the MOV PJ cut needs. */
    contractTypes: z.array(nonEmptyText.nullable()).min(1).optional(),
    relationships: z.array(relationshipSchema).min(1).optional(),
    origins: z.array(nonEmptyText).min(1).optional(),
    groupIds: z.array(z.uuid()).min(1).optional(),
    tags: z.array(nonEmptyText).min(1).optional(),
    assigneeIds: z.array(assigneeFilterValueSchema).min(1).optional(),
    /** `null` = no priority, which the queue shows as "Sem prioridade". */
    priorities: z.array(ticketPrioritySchema.nullable()).min(1).optional(),
    /** Free text over the ticket's subject, accent- and case-insensitive. */
    subjectQuery: nonEmptyText.optional(),
    actionDateBefore: dateCut.optional(),
    urgentBy: dateCut.optional(),
    createdSince: dateCut.optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'TicketFilter' })

/**
 * The filter as a READ accepts it: everything a view saves, plus the cuts a
 * screen derives per render and never stores. `companyIdsExact` stays out of
 * `ticketFilterSchema` so it cannot be saved into a view, where it would be a
 * criterion nobody chose.
 */
export const ticketReadFilterSchema = ticketFilterSchema.extend({
  companyIdsExact: z.array(z.uuid()).min(1).optional(),
})

export type AssigneeFilterValue = z.infer<typeof assigneeFilterValueSchema>
export type TicketFilter = z.infer<typeof ticketFilterSchema>
export type TicketReadFilter = z.infer<typeof ticketReadFilterSchema>
