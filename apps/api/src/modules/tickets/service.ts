import { NotFoundError } from '../../shared/errors.js'
import type { TicketsRepositoryPort } from './repository.js'
import type { CreateTicketBody, Ticket, TicketStatus, UpdateTicketBody } from './schemas.js'

const CLOSED_STATUSES = new Set<TicketStatus>(['completed', 'cancelled'])

export class TicketsService {
  constructor(private readonly repository: TicketsRepositoryPort) {}

  async get(id: string): Promise<Ticket> {
    const ticket = await this.repository.findById(id)

    if (!ticket) {
      throw new NotFoundError(`Ticket ${id} not found`)
    }

    return ticket
  }

  create(data: CreateTicketBody): Promise<Ticket> {
    return this.repository.create(data)
  }

  async update(id: string, data: UpdateTicketBody): Promise<Ticket> {
    const payload: UpdateTicketBody = { ...data }

    if (
      payload.status !== undefined &&
      CLOSED_STATUSES.has(payload.status) &&
      payload.closedAt === undefined
    ) {
      payload.closedAt = new Date().toISOString()
    }

    if (payload.closedAt != null && payload.status === undefined) {
      payload.status = 'completed'
    }

    if (
      payload.status !== undefined &&
      !CLOSED_STATUSES.has(payload.status) &&
      payload.closedAt === undefined
    ) {
      payload.closedAt = null
    }

    const ticket = await this.repository.update(id, payload)
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`)
    return ticket
  }
}
