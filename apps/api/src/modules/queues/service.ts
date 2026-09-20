import { ForbiddenError, NotFoundError } from '../../shared/errors.js'
import type { TicketsRepositoryPort } from '../tickets/repository.js'
import type { TicketList } from '../tickets/schemas.js'
import type { QueuesRepositoryPort } from './repository.js'
import type {
  CreateQueueBody,
  ListQueueTicketsQuery,
  ListQueuesQuery,
  Queue,
  QueueList,
  UpdateQueueBody,
} from './schemas.js'

/** A personal view belongs to whoever is holding it: naming another owner would
 *  put a view in someone else's sidebar, which nobody asked for. */
function assertOwnsIt(ownerId: string | null | undefined, viewerId: string): void {
  if (ownerId !== undefined && ownerId !== null && ownerId !== viewerId) {
    throw new ForbiddenError('A personal view belongs to the person creating it')
  }
}

export class QueuesService {
  constructor(
    private readonly repository: QueuesRepositoryPort,
    private readonly ticketsRepository: TicketsRepositoryPort,
  ) {}

  create(data: CreateQueueBody, createdBy: string): Promise<Queue> {
    assertOwnsIt(data.ownerId, createdBy)
    return this.repository.create(data, createdBy)
  }

  async get(id: string): Promise<Queue> {
    const queue = await this.repository.findById(id)
    if (!queue) throw new NotFoundError(`Queue ${id} not found`)
    return queue
  }

  async list(query: ListQueuesQuery): Promise<QueueList> {
    const { data, total } = await this.repository.findMany(query)
    return { data, total, page: query.page, pageSize: query.pageSize }
  }

  async update(id: string, data: UpdateQueueBody, updatedBy: string): Promise<Queue> {
    assertOwnsIt(data.ownerId, updatedBy)
    const queue = await this.repository.update(id, data, updatedBy)
    if (!queue) throw new NotFoundError(`Queue ${id} not found`)
    return queue
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id)
    if (!deleted) throw new NotFoundError(`Queue ${id} not found`)
  }

  async listTickets(queueId: string, query: ListQueueTicketsQuery): Promise<TicketList> {
    await this.get(queueId)
    const { data, total } = await this.ticketsRepository.findMany({ queueId, ...query })
    return { data, total, page: query.page, pageSize: query.pageSize }
  }
}
