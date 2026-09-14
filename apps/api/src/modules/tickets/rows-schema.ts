import { z } from 'zod'
import { relationshipSchema, ticketPrioritySchema, ticketStatusSchema } from './schemas.js'

/** The `TicketFilter` as a query string: repeated parameters, which Fastify
 *  hands over as a bare value when a field occurs once. */
/** `@none` is the client's own token for `null`, which cannot travel here. */
const NULL_TOKEN = '@none'

/** One preprocess and no nesting — a preprocess inside another has no type the
 *  OpenAPI export can describe. */
const list = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((raw) => {
    if (raw === undefined) return undefined
    const values = Array.isArray(raw) ? raw : [raw]
    return values.map((value) => (value === NULL_TOKEN ? null : value))
  }, z.array(item).min(1))

const text = z.string().min(1)

export const ticketRowsQuerySchema = z.object({
  statuses: list(ticketStatusSchema).optional(),
  companyIds: list(z.uuid()).optional(),
  carrierIds: list(text).optional(),
  products: list(text).optional(),
  types: list(text).optional(),
  companySizes: list(text).optional(),
  contractTypes: list(text.nullable()).optional(),
  relationships: list(relationshipSchema).optional(),
  origins: list(text).optional(),
  groupIds: list(z.uuid()).optional(),
  tags: list(text).optional(),
  assigneeIds: list(text.nullable()).optional(),
  priorities: list(ticketPrioritySchema.nullable()).optional(),
  subjectQuery: text.optional(),
  actionDateBefore: z.iso.date().optional(),
  urgentBy: z.iso.date().optional(),
  createdSince: z.iso.date().optional(),
  archived: z.stringbool().optional(),
  window: z.enum(['awake', 'sleeping', 'all']).default('awake'),
  limit: z.coerce.number().int().min(1).max(5000).default(5000),
})

export type TicketRowsQuery = z.infer<typeof ticketRowsQuerySchema>

/** Every query parameter, classified: `true` is text a person types, so it
 *  carries whoever they are searching for and must leave `req.url`. */
export const QUERY_FIELD_PII = {
  statuses: 'closed vocabulary',
  companyIds: 'internal uuid',
  carrierIds: 'carrier, not a person',
  products: 'closed vocabulary',
  types: 'closed vocabulary',
  companySizes: 'closed vocabulary',
  contractTypes: 'closed vocabulary',
  relationships: 'closed vocabulary',
  origins: 'closed vocabulary',
  groupIds: 'internal uuid',
  tags: 'a label picked from the queue, never typed free — ACE-196',
  assigneeIds: 'Pipo user id, not the beneficiary — ACE-196',
  priorities: 'closed vocabulary',
  subjectQuery: true,
  actionDateBefore: 'date',
  urgentBy: 'date',
  createdSince: 'date',
  archived: 'boolean',
  window: 'closed vocabulary',
  limit: 'number',
} satisfies Record<keyof TicketRowsQuery, true | string>

/** No `enrollment_snapshot` — leaving it out is the point of the endpoint.
 *  The three fields dug out of it say word or null, never `''`, like the five
 *  movement columns: a blank is not a name. */
export const ticketRowSchema = z
  .object({
    id: z.uuid(),
    displayNumber: z.string(),
    title: z.string().nullable(),
    enrollmentId: z.uuid(),
    enrollmentType: z.string(),
    status: ticketStatusSchema,
    priority: ticketPrioritySchema.nullable(),
    actionDate: z.iso.datetime({ offset: true }).nullable(),
    groupId: z.uuid().nullable(),
    assigneeId: z.string().min(1).nullable(),
    companyId: z.uuid(),
    companyName: z.string().min(1).nullable(),
    beneficiaryName: z.string().min(1).nullable(),
    taxId: z.string().min(1).nullable(),
    carrierId: z.string().nullable(),
    carrierName: z.string().nullable(),
    product: z.string().nullable(),
    contractType: z.string().nullable(),
    companySize: z.string().nullable(),
    relationship: relationshipSchema.nullable(),
    tags: z.array(z.string()),
    sourceSystem: z.string(),
    closedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'TicketRow' })

/** Every field of the projection, classified: `true` never reaches a log line,
 *  anything else is the reason it may. The record is what makes it exhaustive. */
export const ROW_FIELD_PII = {
  id: 'internal uuid',
  displayNumber: 'ticket number, not a person',
  title: true,
  enrollmentId: 'internal uuid',
  enrollmentType: 'inclusion | exclusion | plan_change',
  status: 'closed vocabulary',
  priority: 'closed vocabulary',
  actionDate: 'date of the work, not of the person',
  groupId: 'internal uuid',
  assigneeId: 'Pipo user id, not the beneficiary — ACE-196',
  companyId: 'internal uuid',
  companyName: 'legal entity, not a natural person',
  beneficiaryName: true,
  taxId: true,
  carrierId: 'carrier, not a person',
  carrierName: 'carrier, not a person',
  product: 'closed vocabulary',
  contractType: 'closed vocabulary',
  companySize: 'closed vocabulary',
  relationship: 'holder | dependent | family-group, says nothing about who',
  tags: 'a label picked from the queue, never typed free — ACE-196',
  sourceSystem: 'closed vocabulary',
  closedAt: 'timestamp',
  createdAt: 'timestamp',
  updatedAt: 'timestamp',
} satisfies Record<keyof z.infer<typeof ticketRowSchema>, true | string>

export const ticketRowsSchema = z
  .object({
    data: z.array(ticketRowSchema),
    /** How many matched, which is more than `data` when `limit` cut. */
    total: z.number().int(),
  })
  .meta({ id: 'TicketRows' })

export type TicketRowPayload = z.infer<typeof ticketRowSchema>
