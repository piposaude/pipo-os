import {
  NotFoundError,
  UnprocessableEntityError,
  ValidationFailedError,
} from '../../shared/errors.js'
import type { Author } from '../auth/authenticate.js'
import { alterationTypeOf } from './enrollment-snapshot.js'
import { canonicalEnrollmentType, parseAlterationType } from './enrollment-type.js'
import type { TicketRowsQuery } from './rows-schema.js'
import type { TicketsRepositoryPort } from './repository.js'
import {
  CLOSED_STATUSES,
  type CreateTicketBody,
  type ListTicketsQuery,
  type Ticket,
  type TicketDetail,
  type TicketList,
  type UpdateTicketBody,
  type UpdateTicketStatusBody,
} from './schemas.js'

export class TicketsService {
  constructor(private readonly repository: TicketsRepositoryPort) {}

  async get(id: string): Promise<TicketDetail> {
    const ticket = await this.repository.findDetailById(id)

    if (!ticket) {
      throw new NotFoundError(`Ticket ${id} not found`)
    }

    return ticket
  }

  async create(body: CreateTicketBody): Promise<Ticket> {
    const { alterationType, ...data } = body
    // The body wins; the snapshot fills what the EI does not send yet, as for
    // the movement columns (PD-207).
    const written = alterationType ?? alterationTypeOf(data.enrollmentSnapshot)
    const enrollmentType = canonicalEnrollmentType(
      data.enrollmentType,
      parseAlterationType(written),
    )
    if (enrollmentType === null) {
      // A word we do not know is a different refusal from no word at all, and
      // the caller fixes each one differently.
      const [code, message] =
        written !== null
          ? ([
              'invalid',
              'alteration_type in the snapshot is not a word this API knows: send alterationType in the body instead',
            ] as const)
          : ([
              'required',
              'alterationType is required when enrollmentType is alteration: in the body, or as alteration_type in the snapshot',
            ] as const)
      throw new ValidationFailedError(message, [{ field: 'alterationType', message, code }])
    }
    return this.repository.create({ ...data, enrollmentType })
  }

  async update(id: string, data: UpdateTicketBody, author?: Author): Promise<Ticket> {
    const ticket = await this.repository.update(id, data, author)
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`)
    return ticket
  }

  async list(query: ListTicketsQuery): Promise<TicketList> {
    const { data, total } = await this.repository.findMany(query)
    return { data, total, page: query.page, pageSize: query.pageSize }
  }

  /** `today` comes from the caller so a test can pin the awake window. */
  async rows(query: TicketRowsQuery, viewerId: string, today: string) {
    return this.repository.findRows(query, viewerId, today)
  }

  async inbox(viewerId: string, today: string) {
    return this.repository.findInbox(viewerId, today)
  }

  async changeStatus(id: string, data: UpdateTicketStatusBody, authorId: string): Promise<Ticket> {
    const isClosed = CLOSED_STATUSES.has(data.status)
    const closedAt = isClosed ? new Date().toISOString() : null

    const result = await this.repository.changeStatus(
      id,
      data.status,
      closedAt,
      authorId,
      data.reason,
      data.completion,
    )

    if (result.kind === 'not-found') throw new NotFoundError(`Ticket ${id} not found`)
    if (result.kind === 'already-closed')
      throw new UnprocessableEntityError(`Ticket ${id} is already closed`)
    if (result.kind === 'refused')
      throw new ValidationFailedError(`Ticket ${id} cannot be completed`, result.failures)
    return result.ticket
  }

  async claim(id: string, claimer: Author): Promise<Ticket> {
    const ticket = await this.repository.claimOpen(id, claimer)
    if (ticket) return ticket

    const existing = await this.repository.findById(id)
    if (!existing) throw new NotFoundError(`Ticket ${id} not found`)
    throw new UnprocessableEntityError(`Ticket ${id} is already closed`)
  }
}
