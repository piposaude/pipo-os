import type { Kysely, Selectable } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { Tickets } from '../../infrastructure/db-types.js'
import type { CreateTicketBody, Ticket } from './schemas.js'

function toTicket(row: Selectable<Tickets>): Ticket {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    enrollmentType: row.enrollment_type,
    status: row.status,
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
  hasOpenTicketForEnrollment(enrollmentId: string): Promise<boolean>
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

  async create(data: CreateTicketBody): Promise<Ticket> {
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
  }

  async hasOpenTicketForEnrollment(enrollmentId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('tickets')
      .select('id')
      .where('enrollment_id', '=', enrollmentId)
      .where('status', 'not in', ['completed', 'cancelled'])
      .executeTakeFirst()

    return row !== undefined
  }
}
