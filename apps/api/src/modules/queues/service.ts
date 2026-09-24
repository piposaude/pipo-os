import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors.js'
import type { GroupMembersRepositoryPort, GroupsRepositoryPort } from '../groups/repository.js'
import type { TicketFilter } from '../tickets/filter-schema.js'
import type { TicketsRepositoryPort } from '../tickets/repository.js'
import type { TicketList } from '../tickets/schemas.js'
import { editRefusal, type Viewer, type ViewOwnership } from './permissions.js'
import type { QueuesRepositoryPort, StoredView } from './repository.js'
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

/** `{}` is the filter that selects the whole window, so an unreadable one
 *  cannot fall back to it. */
function readableFilter(queue: Queue): TicketFilter {
  if (queue.filters === null) {
    throw new ConflictError(`Queue ${queue.id} has a saved filter this version cannot read`)
  }
  return queue.filters
}

/** A personal view belongs to whoever is holding it: naming another owner would
 *  put a view in someone else's sidebar, which nobody asked for. */
function assertOwnsIt(ownerId: string | null | undefined, viewerId: string): void {
  if (ownerId !== undefined && ownerId !== null && ownerId !== viewerId) {
    throw new ForbiddenError('A personal view belongs to the person creating it')
  }
}

/** Twin of MOV_LABELS in web/src/lib/pipodesk/tree.ts, which finds these three
 *  views of a pod by name: renaming or moving one detaches it from the pod. */
const POD_CUTS: ReadonlySet<string> = new Set(['MOV CLT', 'MOV PJ', 'MOV MB'])

const isPodCut = (view: StoredView): boolean => view.groupId !== null && POD_CUTS.has(view.name)

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
    await this.assertCutNameFree(data.groupId ?? null, data.name)
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
    const current = await this.ownershipOf(id)
    await this.assertMayEdit(current, viewer)
    const renamed = data.name !== undefined && data.name !== current.name
    const regrouped = data.groupId !== undefined && data.groupId !== current.groupId
    if (isPodCut(current) && (renamed || regrouped)) {
      throw new ConflictError(`${current.name} is found by the pod by its name and group`)
    }

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
    if (renamed || regrouped) {
      await this.assertCutNameFree(moved.groupId, data.name ?? current.name, id)
    }

    const queue = await this.repository.update(id, data, viewer.id)
    if (!queue) throw new NotFoundError(`Queue ${id} not found`)
    return queue
  }

  /** Removing is not editing: `group_id` is `ON DELETE RESTRICT`, so without a
   *  key that reaches the personal view of somebody else a pod stays undeletable
   *  forever. Reading and editing it stay closed. */
  async delete(id: string, viewer: Viewer): Promise<void> {
    const view = await this.ownershipOf(id)
    if (!viewer.structureAdmin) {
      await this.assertMayEdit(view, viewer)
      if (isPodCut(view)) throw new ConflictError(`${view.name} is deleted with its pod`)
    }
    const deleted = await this.repository.delete(id)
    if (!deleted) throw new NotFoundError(`Queue ${id} not found`)
  }

  private async assertCutNameFree(
    groupId: string | null,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    if (groupId === null || !POD_CUTS.has(name)) return
    if (await this.repository.isNameTaken(groupId, name, exceptId)) {
      throw new ConflictError(`The group already has a view named ${name}`)
    }
  }

  private async ownershipOf(id: string): Promise<StoredView> {
    const view = await this.repository.findOwnership(id)
    if (!view) throw new NotFoundError(`Queue ${id} not found`)
    return view
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
    const filters = new Map<string, TicketFilter>()
    for (const queue of queues) {
      if (queue.filters !== null) filters.set(queue.id, queue.filters)
    }
    const totals = await this.ticketsRepository.countByFilters(filters, viewerId, window, today)

    // In the order asked for, which the sidebar renders in: a SELECT without
    // ORDER BY answers in whatever order the heap happens to hold.
    return {
      data: ids
        .filter((id) => filters.has(id))
        .map((id) => ({ queueId: id, total: totals.get(id) ?? 0 })),
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
    const filter = readableFilter(queue)
    const { data, total } = await this.ticketsRepository.findByFilter(
      { filter, sort: queue.sort, today, ...query },
      viewerId,
    )
    return { data, total, page: query.page, pageSize: query.pageSize }
  }
}
