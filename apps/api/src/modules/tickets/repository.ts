import { sql, type Kysely, type Selectable } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { TicketFormValues, Tickets } from '../../infrastructure/db-types.js'
import { ConflictError } from '../../shared/errors.js'
import type {
  CreateTicketBody,
  FormValue,
  PatchFormValuesBody,
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

function toFormValue(row: Selectable<TicketFormValues>): FormValue {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    fieldKey: row.field_key,
    fieldValue: row.field_value,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString(),
  }
}

export interface TicketsRepositoryPort {
  findById(id: string): Promise<Ticket | undefined>
  create(data: CreateTicketBody): Promise<Ticket>
  update(id: string, data: UpdateTicketBody): Promise<Ticket | undefined>
  findFormValues(ticketId: string): Promise<FormValue[]>
  upsertFormValues(
    ticketId: string,
    entries: PatchFormValuesBody,
    actor: string,
  ): Promise<FormValue[]>
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

  async findFormValues(ticketId: string): Promise<FormValue[]> {
    const rows = await this.db
      .selectFrom('ticket_form_values')
      .selectAll()
      .where('ticket_id', '=', ticketId)
      .execute()

    return rows.map(toFormValue)
  }

  // actor is the authenticated caller's email; updated_by remains null until
  // ACE-18 resolves session email to a user UUID.
  async upsertFormValues(
    ticketId: string,
    entries: PatchFormValuesBody,
    _actor: string,
  ): Promise<FormValue[]> {
    await this.db
      .insertInto('ticket_form_values')
      .values(
        entries.map((e) => ({
          ticket_id: ticketId,
          field_key: e.fieldKey,
          field_value: JSON.stringify(e.fieldValue),
          updated_by: null,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['ticket_id', 'field_key']).doUpdateSet((eb) => ({
          field_value: eb.ref('excluded.field_value'),
          updated_by: eb.ref('excluded.updated_by'),
          updated_at: sql`now()`,
        })),
      )
      .execute()

    return this.findFormValues(ticketId)
  }
}
