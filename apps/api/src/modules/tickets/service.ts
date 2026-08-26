import { NotFoundError } from '../../shared/errors.js'
import type { TicketsRepositoryPort } from './repository.js'
import type {
  CreateTicketBody,
  ListTicketsQuery,
  Ticket,
  TicketList,
  TicketStatus,
  UpdateTicketBody,
} from './schemas.js'

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

    const hasStatus = payload.status !== undefined
    const hasClosedAt = payload.closedAt !== undefined

    if (hasStatus) {
      const isClosed = CLOSED_STATUSES.has(payload.status!)

      if (isClosed && !hasClosedAt) {
        payload.closedAt = new Date().toISOString()
      } else if (!isClosed && !hasClosedAt) {
        payload.closedAt = null
      }
    }

    if (!hasStatus && payload.closedAt != null) {
      payload.status = 'completed'
    }

    const ticket = await this.repository.update(id, payload)
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`)
    return ticket
  }

  async list(query: ListTicketsQuery): Promise<TicketList> {
    const { data, total } = await this.repository.findMany(query)
    return { data, total, page: query.page, pageSize: query.pageSize }
  }

  async claim(id: string, assigneeId: string): Promise<Ticket> {
    // Calls repository directly instead of this.update() — claim has no status
    // constraints and must not inherit future gate logic added to update().
    const ticket = await this.repository.update(id, { assigneeId })
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`)
    return ticket
  }
}
