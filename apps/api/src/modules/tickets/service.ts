import { NotFoundError } from '../../shared/errors.js'
import type { TicketsRepository } from './repository.js'
import type { CreateTicketBody, Ticket, UpdateTicketBody } from './schemas.js'

export class TicketsService {
  constructor(private readonly repository: TicketsRepository) {}

  list(): Promise<Ticket[]> {
    return this.repository.findAll()
  }

  create(data: CreateTicketBody): Promise<Ticket> {
    return this.repository.create(data)
  }

  async update(id: string, data: UpdateTicketBody): Promise<Ticket> {
    const ticket = await this.repository.update(id, data)

    if (!ticket) {
      throw new NotFoundError(`Ticket ${id} not found`)
    }

    return ticket
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.repository.delete(id)

    if (!deleted) {
      throw new NotFoundError(`Ticket ${id} not found`)
    }
  }
}
