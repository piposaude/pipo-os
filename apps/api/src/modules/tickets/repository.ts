import { sql, type Kysely, type RawBuilder, type Selectable } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { Tickets } from '../../infrastructure/db-types.js'
import { ConflictError } from '../../shared/errors.js'
import { movementFieldsOf, relationshipOf } from './enrollment-snapshot.js'
import { actionDateWindowCondition, ticketFilterConditions } from './filter-resolver.js'
import type { TicketRowPayload, TicketRowsQuery } from './rows-schema.js'
import { toClient } from './vocabulary.js'
import {
  CLOSED_STATUSES,
  relationshipSchema,
  type CreateTicketBody,
  type ListTicketsQuery,
  type Ticket,
  type TicketStatus,
  type UpdateTicketBody,
} from './schemas.js'

export type ChangeStatusResult =
  { kind: 'not-found' } | { kind: 'already-closed' } | { kind: 'ok'; ticket: Ticket }

const OPEN_ENROLLMENT_CONSTRAINT = 'uq_tickets_open_enrollment'

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
    requester: row.requester as Record<string, unknown> | null,
    collaborators: row.collaborators as Array<Record<string, unknown>>,
    forceCompletion: row.force_completion,
    enrollmentSnapshot: row.enrollment_snapshot as Record<string, unknown>,
    carrierId: blankAsNull(row.carrier_id),
    carrierName: blankAsNull(row.carrier_name),
    product: blankAsNull(toClient('product', row.product)),
    contractType: blankAsNull(toClient('contractType', row.contract_type)),
    companySize: blankAsNull(toClient('companySize', row.company_size)),
    relationship: relationshipSchema.safeParse(row.relationship).data ?? null,
    sourceSystem: row.source_system,
    parentTicketId: row.parent_ticket_id,
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export interface TicketsRepositoryPort {
  findById(id: string): Promise<Ticket | undefined>
  create(data: CreateTicketBody): Promise<Ticket>
  update(id: string, data: UpdateTicketBody): Promise<Ticket | undefined>
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

/**
 * The first spelling under `parent` that holds a real word, mirroring the
 * web's `readString` in `ticket-row.ts` — the queue has to read the snapshot
 * the same way on both sides or the number a node announces stops matching
 * the list the screen draws.
 *
 * Two rules that `coalesce` alone would miss, and each one is a divergence
 * the web does not have:
 *   - a blank counts as absent, so `company-name: ''` falls through to `name`;
 *   - only a JSON string counts, so a number does not become `"42"` here
 *     while the web reads it as nothing.
 */
function snapshotString(parent: string[], keys: string[]): RawBuilder<string | null> {
  const candidates = keys.map((key) => {
    /* `array[...]` of literals, not a `'{a,b}'` string built by concatenation:
       the segments are constants today, and this keeps a future caller from
       turning a key with a comma or a brace into a different path. */
    const path = sql`array[${sql.join([...parent, key].map(sql.lit), sql`, `)}]`
    return sql`nullif(btrim(case when jsonb_typeof(enrollment_snapshot #> ${path}) = 'string'
                                 then enrollment_snapshot #>> ${path} end), '')`
  })
  return sql<string | null>`coalesce(${sql.join(candidates, sql`, `)})`
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

  async findMany(query: ListTicketsQuery): Promise<{ data: Ticket[]; total: number }> {
    const offset = (query.page - 1) * query.pageSize

    const base = this.db
      .selectFrom('tickets')
      .$if(query.status !== undefined, (q) => q.where('status', '=', query.status!))
      .$if(query.queueId !== undefined, (q) => q.where('queue_id', '=', query.queueId!))
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
        snapshotString(['company'], ['company_name', 'company-name', 'companyName', 'name']).as(
          'company_name',
        ),
        snapshotString(
          ['primary', 'profile'],
          ['preferred_name', 'preferred-name', 'preferredName', 'name'],
        ).as('beneficiary_name'),
        snapshotString(['primary', 'profile'], ['tax_id', 'tax-id', 'taxId']).as('tax_id'),
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

  async create(data: CreateTicketBody): Promise<Ticket> {
    // The body wins; the snapshot fills what the EI does not send yet (PD-207).
    const derived = movementFieldsOf(data.enrollmentSnapshot)

    try {
      const row = await this.db
        .insertInto('tickets')
        .values({
          enrollment_id: data.enrollmentId,
          enrollment_type: data.enrollmentType,
          company_id: data.companyId,
          source_system: data.sourceSystem,
          enrollment_snapshot: JSON.stringify(data.enrollmentSnapshot),
          carrier_id: data.carrierId ?? derived.carrierId,
          carrier_name: data.carrierName ?? derived.carrierName,
          product: data.product ?? derived.product,
          contract_type: data.contractType ?? derived.contractType,
          company_size: data.companySize ?? derived.companySize,
          relationship: relationshipOf(data.enrollmentSnapshot),
          status: data.status ?? 'broker-processing',
          queue_id: data.queueId,
          assignee_id: data.assigneeId,
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
        err.code === '23505' &&
        'constraint' in err &&
        err.constraint === OPEN_ENROLLMENT_CONSTRAINT
      ) {
        throw new ConflictError(`Enrollment ${data.enrollmentId} already has an open ticket`)
      }
      throw err
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

  async update(id: string, data: UpdateTicketBody): Promise<Ticket | undefined> {
    const row = await this.db
      .updateTable('tickets')
      .set({
        ...(data.status !== undefined && { status: data.status }),
        ...(data.queueId !== undefined && { queue_id: data.queueId }),
        ...(data.assigneeId !== undefined && { assignee_id: data.assigneeId }),
        ...(data.tags !== undefined && { tags: data.tags }),
        ...(data.forceCompletion !== undefined && { force_completion: data.forceCompletion }),
        ...(data.closedAt !== undefined && { closed_at: data.closedAt }),
        ...(data.parentTicketId !== undefined && { parent_ticket_id: data.parentTicketId }),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    return row ? toTicket(row) : undefined
  }
}
