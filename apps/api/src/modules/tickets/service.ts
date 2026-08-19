import { NotFoundError } from '../../shared/errors.js'
import type { TicketsRepositoryPort } from './repository.js'
import type {
  CreateTicketBody,
  FormValue,
  PatchFormValuesBody,
  Ticket,
  UpdateTicketBody,
} from './schemas.js'

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
    const ticket = await this.repository.update(id, data)
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`)
    return ticket
  }

  async getFormValues(ticketId: string): Promise<FormValue[]> {
    const ticket = await this.repository.findById(ticketId)
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`)
    return this.repository.findFormValues(ticketId)
  }

  async upsertFormValues(
    ticketId: string,
    entries: PatchFormValuesBody,
    actor: string,
  ): Promise<FormValue[]> {
    const ticket = await this.repository.findById(ticketId)
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`)
    return this.repository.upsertFormValues(ticketId, entries, actor)
  }
}
