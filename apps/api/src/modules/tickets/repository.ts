import { sql, type Kysely, type Selectable } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { Tickets } from '../../infrastructure/db-types.js'
import { ConflictError } from '../../shared/errors.js'
import type {
  CreateTicketBody,
  ListTicketsQuery,
  Ticket,
  TicketStatus,
  UpdateTicketBody,
} from './schemas.js'

const OPEN_ENROLLMENT_CONSTRAINT = 'uq_tickets_open_enrollment'

function toTicket(row: Selectable<Tickets>): Ticket {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    enrollmentType: row.enrollment_type,
    status: row.status as TicketStatus,
    queueId: row.queue_id,
    assigneeId: row.assignee_id,
    companyId: row.company_id,
    tags: row.tags as string[],
    forceCompletion: row.force_completion,
    enrollmentSnapshot: row.enrollment_snapshot as Record<string, unknown>,
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
  findMany(query: ListTicketsQuery): Promise<{ data: Ticket[]; total: number }>
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
      .$if(!!query.tags?.length, (q) => q.where(sql<boolean>`tags @> ${query.tags!}::text[]`))
      .$if(!!query.search, (q) =>
        q.where(sql<boolean>`enrollment_snapshot::text ILIKE ${`%${query.search}%`}`),
      )

    const [{ count }, rows] = await Promise.all([
      base.select((eb) => eb.fn.countAll<string>().as('count')).executeTakeFirstOrThrow(),
      base
        .selectAll()
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .limit(query.pageSize)
        .offset(offset)
        .execute(),
    ])

    return { data: rows.map(toTicket), total: Number(count) }
  }

  async create(data: CreateTicketBody): Promise<Ticket> {
    try {
      const row = await this.db
        .insertInto('tickets')
        .values({
          enrollment_id: data.enrollmentId,
          enrollment_type: data.enrollmentType,
          company_id: data.companyId,
          source_system: data.sourceSystem,
          enrollment_snapshot: JSON.stringify(data.enrollmentSnapshot),
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
