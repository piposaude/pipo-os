import { NotFoundError } from '../../shared/errors.js'
import type { TicketsRepositoryPort } from '../tickets/repository.js'
import type { TicketList } from '../tickets/schemas.js'
import type { QueueGroupsRepositoryPort, QueuesRepositoryPort } from './repository.js'
import type {
  CreateQueueBody,
  ListQueueTicketsQuery,
  ListQueuesQuery,
  Queue,
  QueueGroup,
  QueueList,
  UpdateQueueBody,
} from './schemas.js'

export class QueuesService {
  constructor(
    private readonly repository: QueuesRepositoryPort,
    private readonly ticketsRepository: TicketsRepositoryPort,
    private readonly queueGroupsRepository: QueueGroupsRepositoryPort,
  ) {}

  create(data: CreateQueueBody, createdBy: string): Promise<Queue> {
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

  async update(id: string, data: UpdateQueueBody): Promise<Queue> {
    const queue = await this.repository.update(id, data)
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

  addGroup(queueId: string, groupId: string): Promise<QueueGroup> {
    return this.queueGroupsRepository.add(queueId, groupId)
  }

  async removeGroup(queueId: string, groupId: string): Promise<void> {
    await this.get(queueId)
    const removed = await this.queueGroupsRepository.remove(queueId, groupId)
    if (!removed) throw new NotFoundError(`Group ${groupId} not linked to queue ${queueId}`)
  }
}
