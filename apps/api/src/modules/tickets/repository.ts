import { sql, type Kysely, type Selectable } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { Tickets } from '../../infrastructure/db-types.js'
import { ValidationFailedError } from '../../shared/errors.js'
import { FK_VIOLATION, UNIQUE_VIOLATION } from '../../shared/pg.js'
import type { Author } from '../auth/authenticate.js'
import { insertEvent } from '../comments/repository.js'
import { OpenTicketConflictError } from './errors.js'
import {
  companyFieldsOf,
  movementFieldsOf,
  relationshipOf,
  snapshotString,
} from './enrollment-snapshot.js'
import { actionDateWindowCondition, ticketFilterConditions } from './filter-resolver.js'
import type { TicketRowPayload, TicketRowsQuery } from './rows-schema.js'
import { toClient } from './vocabulary.js'
import {
  CLOSED_STATUSES,
  relationshipSchema,
  type CreateTicketData,
  type ListTicketsQuery,
  type Ticket,
  type TicketStatus,
  type UpdateTicketBody,
} from './schemas.js'

export type ChangeStatusResult =
  { kind: 'not-found' } | { kind: 'already-closed' } | { kind: 'ok'; ticket: Ticket }

const OPEN_ENROLLMENT_CONSTRAINT = 'uq_tickets_open_enrollment'

const FK_FIELDS: Record<string, string> = {
  tickets_group_id_fkey: 'groupId',
  tickets_parent_ticket_id_fkey: 'parentTicketId',
  tickets_queue_id_fkey: 'queueId',
}

/** The write names a row that is not there. Rethrown as a field error so POST
 *  and PATCH answer 422 pointing at the field, not 500. */
function rethrowMissingReference(err: unknown): never {
  if (err instanceof Error && 'code' in err && err.code === FK_VIOLATION && 'constraint' in err) {
    const field = FK_FIELDS[err.constraint as string]
    if (field) {
      throw new ValidationFailedError(`${field} does not exist`, [
        { field, message: `${field} does not exist`, code: 'not-found' },
      ])
    }
  }
  throw err
}

/** `.min(1)` on the response would turn one hand-edited row into a 500 for the
 *  whole page, so a blank column reads as the null it means. */
const blankAsNull = (value: string | null): string | null =>
  value === null || value.trim() === '' ? null : value

function toTicket(row: Selectable<Tickets>): Ticket {
  return {
    id: row.id,
    displayNumber: row.display_number,
    title: row.title,
    enrollmentId: row.enrollment_id,
    enrollmentType: row.enrollment_type,
    status: row.status as TicketStatus,
    priority: row.priority as Ticket['priority'],
    actionDate: row.action_date ? row.action_date.toISOString() : null,
    queueId: row.queue_id,
    groupId: row.group_id,
    assigneeId: row.assignee_id,
    companyId: row.company_id,
    tags: row.tags as string[],
    pendingDocumentation: row.pending_documentation as string[],
    requester: row.requester as Ticket['requester'],
    collaborators: row.collaborators as Ticket['collaborators'],
    forceCompletion: row.force_completion,
    enrollmentSnapshot: row.enrollment_snapshot as Record<string, unknown>,
    carrierId: blankAsNull(row.carrier_id),
    carrierName: blankAsNull(row.carrier_name),
    product: blankAsNull(toClient('product', row.product)),
    contractType: blankAsNull(toClient('contractType', row.contract_type)),
    companySize: blankAsNull(toClient('companySize', row.company_size)),
    parentCompanyId: row.parent_company_id,
    parentCompanyName: blankAsNull(row.parent_company_name),
    companyTaxId: blankAsNull(row.company_tax_id),
    relationship: relationshipSchema.safeParse(row.relationship).data ?? null,
    sourceSystem: row.source_system,
    origin: blankAsNull(row.origin),
    parentTicketId: row.parent_ticket_id,
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export interface TicketsRepositoryPort {
  findById(id: string): Promise<Ticket | undefined>
  create(data: CreateTicketData): Promise<Ticket>
  update(id: string, data: UpdateTicketBody, author?: Author): Promise<Ticket | undefined>
  claimOpen(id: string, assigneeId: string): Promise<Ticket | undefined>
  changeStatus(
    id: string,
    toStatus: TicketStatus,
    closedAt: string | null,
    authorId: string,
    reason?: string,
  ): Promise<ChangeStatusResult>
  findMany(query: ListTicketsQuery): Promise<{ data: Ticket[]; total: number }>
  findRows(
    query: TicketRowsQuery,
    viewerId: string,
    today: string,
  ): Promise<{ data: TicketRowPayload[]; total: number }>
}

export class TicketsRepository implements TicketsRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async findById(id: string): Promise<Ticket | undefined> {
    const row = await this.db
      .selectFrom('tickets')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()

    return row ? toTicket(row) : undefined
  }

  /** Exact, unlike `companyIds` of `/tickets/rows`: this is the EI's
   *  idempotency path, where the company asked for is the company. */
  async findMany(query: ListTicketsQuery): Promise<{ data: Ticket[]; total: number }> {
    const offset = (query.page - 1) * query.pageSize

    const base = this.db
      .selectFrom('tickets')
      .$if(query.status !== undefined, (q) => q.where('status', '=', query.status!))
      .$if(query.queueId !== undefined, (q) => q.where('queue_id', '=', query.queueId!))
      .$if(query.enrollmentId !== undefined, (q) =>
        q.where('enrollment_id', '=', query.enrollmentId!),
      )
      .$if(query.assigneeId !== undefined, (q) => q.where('assignee_id', '=', query.assigneeId!))
      .$if(query.companyId !== undefined, (q) => q.where('company_id', '=', query.companyId!))
      .$if(query.enrollmentType !== undefined, (q) =>
        q.where('enrollment_type', '=', query.enrollmentType!),
      )
      .$if(query.sourceSystem !== undefined, (q) =>
        q.where('source_system', '=', query.sourceSystem!),
      )
      .$if(!!query.tags?.length, (q) => q.where(sql<boolean>`tags && ${query.tags!}::text[]`))
      .$if(!!query.search, (q) => {
        const escaped = query.search!.replace(/[\\%_]/g, '\\$&')
        const pattern = `%${escaped}%`
        return q.where(sql<boolean>`
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(enrollment_snapshot->'membros') = 'array'
                  THEN enrollment_snapshot->'membros'
                ELSE '[]'::jsonb
              END
            ) AS m
            WHERE m->>'name' ILIKE ${pattern} ESCAPE '\\'
               OR m->>'tax_id' ILIKE ${pattern} ESCAPE '\\'
          )
        `)
      })

    const rows = await base
      .selectAll()
      .select(sql<string>`count(*) over ()`.as('total_count'))
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(query.pageSize)
      .offset(offset)
      .execute()

    if (rows.length > 0) {
      return {
        data: rows.map((row) => toTicket(row as unknown as Selectable<Tickets>)),
        total: Number(rows[0].total_count),
      }
    }

    const { count } = await base
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow()

    return { data: [], total: Number(count) }
  }

  /** Three values have no column yet, so they are dug out of the jsonb here. */
  async findRows(
    query: TicketRowsQuery,
    viewerId: string,
    today: string,
  ): Promise<{ data: TicketRowPayload[]; total: number }> {
    const { window, limit, ...filter } = query

    const rows = await this.db
      .selectFrom('tickets')
      .where((eb) => {
        const parts = ticketFilterConditions(eb, filter, viewerId)
        const slice = actionDateWindowCondition(window, today)
        return eb.and(slice ? [...parts, slice] : parts)
      })
      .select([
        'id',
        'display_number',
        'title',
        'enrollment_id',
        'enrollment_type',
        'status',
        'priority',
        'action_date',
        'group_id',
        'assignee_id',
        'company_id',
        'parent_company_id',
        'parent_company_name',
        'company_tax_id',
        'carrier_id',
        'carrier_name',
        'product',
        'contract_type',
        'company_size',
        'relationship',
        'tags',
        'source_system',
        'closed_at',
        'created_at',
        'updated_at',
      ])
      .select([
        snapshotString(['company'], ['company-name', 'name']).as('company_name'),
        snapshotString(['primary', 'profile'], ['preferred-name', 'name']).as('beneficiary_name'),
        snapshotString(['primary', 'profile'], ['tax-id']).as('tax_id'),
      ])
      .select(sql<string>`count(*) over ()`.as('total_count'))
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute()

    const data = rows.map((row) => ({
      id: row.id,
      displayNumber: row.display_number,
      title: row.title,
      enrollmentId: row.enrollment_id,
      enrollmentType: row.enrollment_type,
      status: row.status as TicketStatus,
      priority: row.priority as TicketRowPayload['priority'],
      actionDate: row.action_date ? row.action_date.toISOString() : null,
      groupId: row.group_id,
      assigneeId: row.assignee_id,
      companyId: row.company_id,
      companyName: row.company_name,
      parentCompanyId: row.parent_company_id,
      parentCompanyName: blankAsNull(row.parent_company_name),
      companyTaxId: blankAsNull(row.company_tax_id),
      beneficiaryName: row.beneficiary_name,
      taxId: row.tax_id,
      carrierId: row.carrier_id,
      carrierName: row.carrier_name,
      product: toClient('product', row.product),
      contractType: toClient('contractType', row.contract_type),
      companySize: toClient('companySize', row.company_size),
      relationship: relationshipSchema.safeParse(row.relationship).data ?? null,
      tags: row.tags as string[],
      sourceSystem: row.source_system,
      closedAt: row.closed_at ? row.closed_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }))

    // The window function counts what matched, not what fit: with more rows than
    // the limit, data.length < total is how the caller learns it was cut.
    return { data, total: rows.length > 0 ? Number(rows[0].total_count) : 0 }
  }

  async create(data: CreateTicketData): Promise<Ticket> {
    // The body wins; the snapshot fills what the EI does not send yet (PD-207).
    const derived = movementFieldsOf(data.enrollmentSnapshot)
    const company = companyFieldsOf(data.enrollmentSnapshot)
    /* The parent is a pair and one source wins it whole, never field by
       field: an id from the body would otherwise carry a name from the
       snapshot. */
    const named =
      data.parentCompanyId === undefined
        ? { id: company.parentCompanyId, name: company.parentCompanyName }
        : { id: data.parentCompanyId, name: data.parentCompanyName ?? null }
    /* No company is a branch of itself, whichever source named the parent:
       the Empresa cell would read `Meridiano › Meridiano`. */
    const parent = named.id === data.companyId ? { id: null, name: null } : named

    try {
      const row = await this.db
        .insertInto('tickets')
        .values({
          enrollment_id: data.enrollmentId,
          enrollment_type: data.enrollmentType,
          company_id: data.companyId,
          source_system: data.sourceSystem,
          enrollment_snapshot: JSON.stringify(data.enrollmentSnapshot),
          title: data.title,
          action_date: data.actionDate,
          origin: data.origin,
          requester: data.requester ? JSON.stringify(data.requester) : null,
          collaborators: JSON.stringify(data.collaborators ?? []),
          carrier_id: data.carrierId ?? derived.carrierId,
          carrier_name: data.carrierName ?? derived.carrierName,
          product: data.product ?? derived.product,
          contract_type: data.contractType ?? derived.contractType,
          company_size: data.companySize ?? derived.companySize,
          parent_company_id: parent.id,
          parent_company_name: parent.name,
          company_tax_id: data.companyTaxId ?? company.companyTaxId,
          relationship: relationshipOf(data.enrollmentSnapshot),
          status: 'broker-processing',
          queue_id: data.queueId,
          assignee_id: data.assigneeId,
          group_id: data.groupId,
          tags: data.tags ?? [],
          force_completion: data.forceCompletion ?? false,
          parent_ticket_id: data.parentTicketId,
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      return toTicket(row)
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        err.code === UNIQUE_VIOLATION &&
        'constraint' in err &&
        err.constraint === OPEN_ENROLLMENT_CONSTRAINT
      ) {
        // Optional on purpose: this read must not turn the 409 into a 500, and
        // the open ticket may have been closed between the INSERT and it.
        const open = await this.db
          .selectFrom('tickets')
          .select('id')
          .where('enrollment_id', '=', data.enrollmentId)
          .where('status', 'not in', [...CLOSED_STATUSES])
          .executeTakeFirst()
          .catch(() => undefined)

        throw new OpenTicketConflictError(
          `Enrollment ${data.enrollmentId} already has an open ticket`,
          open?.id,
        )
      }
      rethrowMissingReference(err)
    }
  }

  async changeStatus(
    id: string,
    toStatus: TicketStatus,
    closedAt: string | null,
    authorId: string,
    reason?: string,
  ): Promise<ChangeStatusResult> {
    return this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('tickets')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst()

      if (!current) return { kind: 'not-found' }
      if (CLOSED_STATUSES.has(current.status as TicketStatus)) {
        return { kind: 'already-closed' }
      }

      const updated = await trx
        .updateTable('tickets')
        .set({ status: toStatus, closed_at: closedAt })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow()

      await trx
        .insertInto('ticket_status_history')
        .values({
          ticket_id: id,
          from_status: current.status,
          to_status: toStatus,
          author_id: authorId,
          author_type: 'user',
          reason: reason ?? null,
        })
        .execute()

      return { kind: 'ok', ticket: toTicket(updated) }
    })
  }

  async claimOpen(id: string, assigneeId: string): Promise<Ticket | undefined> {
    const row = await this.db
      .updateTable('tickets')
      .set({ assignee_id: assigneeId })
      .where('id', '=', id)
      .where('status', 'not in', ['completed', 'cancelled'])
      .returningAll()
      .executeTakeFirst()

    return row ? toTicket(row) : undefined
  }

  async update(id: string, data: UpdateTicketBody, author?: Author): Promise<Ticket | undefined> {
    const columns = {
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.queueId !== undefined && { queue_id: data.queueId }),
      ...(data.assigneeId !== undefined && { assignee_id: data.assigneeId }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.forceCompletion !== undefined && { force_completion: data.forceCompletion }),
      ...(data.parentTicketId !== undefined && { parent_ticket_id: data.parentTicketId }),
    }

    try {
      // Only the priority writes an event, and only the event needs the value
      // it replaced: every other field keeps the single statement it had.
      if (data.priority === undefined) {
        const row = await this.db
          .updateTable('tickets')
          .set(columns)
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirst()

        return row ? toTicket(row) : undefined
      }

      return await this.db.transaction().execute(async (trx) => {
        // The row is read under lock because the event carries what it
        // replaced: two concurrent changes would report the same before.
        const current = await trx
          .selectFrom('tickets')
          .selectAll()
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirst()

        if (!current) return undefined

        const row = await trx
          .updateTable('tickets')
          .set(columns)
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow()

        if (data.priority !== current.priority) {
          // Loud and not `author &&`: skipping the line quietly would lose the
          // record of who changed it, which is the whole point of writing one.
          if (!author) throw new Error('Priority changed with no author to sign it')

          await insertEvent(
            trx,
            {
              ticketId: id,
              eventType: 'priority_changed',
              body: data.priority === null ? 'Prioridade removida' : 'Prioridade alterada',
              metadata: { priority: data.priority, previous: current.priority },
            },
            author,
          )
        }

        return toTicket(row)
      })
    } catch (err) {
      rethrowMissingReference(err)
    }
  }
}
