import { ForbiddenError, NotFoundError } from '../../shared/errors.js'
import type { GroupMembersRepositoryPort, GroupsRepositoryPort } from '../groups/repository.js'
import type { TicketsRepositoryPort } from '../tickets/repository.js'
import type { TicketList } from '../tickets/schemas.js'
import { editRefusal, type Viewer, type ViewOwnership } from './permissions.js'
import type { QueuesRepositoryPort } from './repository.js'
import type {
  CreateQueueBody,
  ListQueueTicketsQuery,
  ListQueuesQuery,
  Queue,
  QueueCounts,
  QueueCountsQuery,
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
    private readonly groupsRepository: GroupsRepositoryPort,
    private readonly membersRepository: GroupMembersRepositoryPort,
  ) {}

  async create(data: CreateQueueBody, viewer: Viewer): Promise<Queue> {
    assertOwnsIt(data.ownerId, viewer.id)
    await this.assertMayEdit(
      { ownerId: data.ownerId ?? null, groupId: data.groupId ?? null },
      viewer,
    )
    return this.repository.create(data, viewer.id)
  }

  async get(id: string, viewerId: string): Promise<Queue> {
    const queue = await this.repository.findById(id, viewerId)
    if (!queue) throw new NotFoundError(`Queue ${id} not found`)
    return queue
  }

  async list(query: ListQueuesQuery, viewerId: string): Promise<QueueList> {
    const { data, total } = await this.repository.findMany(query, viewerId)
    return { data, total, page: query.page, pageSize: query.pageSize }
  }

  /** Idempotent on both sides: the sidebar star is a state, not a counter. */
  async favorite(id: string, viewerId: string): Promise<void> {
    await this.get(id, viewerId)
    await this.repository.favorite(id, viewerId)
  }

  async unfavorite(id: string, viewerId: string): Promise<void> {
    await this.get(id, viewerId)
    await this.repository.unfavorite(id, viewerId)
  }

  async update(id: string, data: UpdateQueueBody, viewer: Viewer): Promise<Queue> {
    assertOwnsIt(data.ownerId, viewer.id)
    const current = await this.get(id, viewer.id)
    await this.assertMayEdit(current, viewer)

    // The view it becomes is checked too, or handing a personal view to the
    // team would be a way around the rule the team view answers to.
    const moved = {
      ownerId: data.ownerId !== undefined ? data.ownerId : current.ownerId,
      groupId: data.groupId !== undefined ? data.groupId : current.groupId,
    }
    // Taking a team view for oneself is not an edit, it is a removal: the pod
    // loses a shared view and only the new owner could give it back.
    if (current.ownerId === null && moved.ownerId !== null) {
      throw new ForbiddenError("A team view cannot become someone's personal view")
    }
    if (moved.ownerId !== current.ownerId || moved.groupId !== current.groupId) {
      await this.assertMayEdit(moved, viewer)
    }

    const queue = await this.repository.update(id, data, viewer.id)
    if (!queue) throw new NotFoundError(`Queue ${id} not found`)
    return queue
  }

  async delete(id: string, viewer: Viewer): Promise<void> {
    await this.assertMayEdit(await this.get(id, viewer.id), viewer)
    const deleted = await this.repository.delete(id)
    if (!deleted) throw new NotFoundError(`Queue ${id} not found`)
  }

  private async assertMayEdit(view: ViewOwnership, viewer: Viewer): Promise<void> {
    // Neither read is needed when the structure policy already answers, and the
    // personal view answers by its owner alone.
    if (viewer.structureAdmin || view.ownerId !== null) {
      const refusal = editRefusal(view, viewer, [], [])
      if (refusal) throw new ForbiddenError(refusal)
      return
    }

    const [nodes, memberships] = await Promise.all([
      this.groupsRepository.findNodes(),
      this.membersRepository.listByUser(viewer.id),
    ])

    const refusal = editRefusal(view, viewer, nodes, memberships)
    if (refusal) throw new ForbiddenError(refusal)
  }

  /** A view that is not there is left out, not counted as zero: it was deleted,
   *  and the sidebar drops the row instead of showing an empty badge. */
  async counts(
    { ids, window }: QueueCountsQuery,
    viewerId: string,
    today: string,
  ): Promise<QueueCounts> {
    const queues = await this.repository.findByIds(ids, viewerId)
    const filters = new Map(queues.map((queue) => [queue.id, queue.filters ?? {}]))
    const totals = await this.ticketsRepository.countByFilters(filters, viewerId, window, today)

    return {
      data: queues.map((queue) => ({ queueId: queue.id, total: totals.get(queue.id) ?? 0 })),
    }
  }

  /** The view selects by its saved filter, resolved for whoever is asking —
   *  `tickets.queue_id` is the old model, a box tickets fall into. */
  async listTickets(
    queueId: string,
    query: ListQueueTicketsQuery,
    viewerId: string,
    today: string,
  ): Promise<TicketList> {
    const queue = await this.get(queueId, viewerId)
    const { data, total } = await this.ticketsRepository.findByFilter(
      { filter: queue.filters ?? {}, sort: queue.sort, today, ...query },
      viewerId,
    )
    return { data, total, page: query.page, pageSize: query.pageSize }
  }
}
