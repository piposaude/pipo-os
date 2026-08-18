import { NotFoundError } from '../../shared/errors.js'
import type { TicketsRepositoryPort } from './repository.js'
import type { CreateTicketBody, Ticket } from './schemas.js'

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
}
