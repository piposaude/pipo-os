import { sql, type Kysely, type Selectable } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { TicketQueues, TicketQueuesXGroup } from '../../infrastructure/db-types.js'
import { ConflictError, NotFoundError } from '../../shared/errors.js'
import { ticketFilterSchema } from '../tickets/filter-schema.js'
import type {
  CreateQueueBody,
  Queue,
  QueueGroup,
  ListQueuesQuery,
  UpdateQueueBody,
} from './schemas.js'

const PG_FK_VIOLATION = '23503'

function toQueue(row: Selectable<TicketQueues>): Queue {
  const filters = ticketFilterSchema.safeParse(row.filters)
  return {
    id: row.id,
    name: row.name,
    filters: filters.success ? filters.data : null,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export interface QueuesRepositoryPort {
  create(data: CreateQueueBody, createdBy: string): Promise<Queue>
  findById(id: string): Promise<Queue | undefined>
  findMany(query: ListQueuesQuery): Promise<{ data: Queue[]; total: number }>
  update(id: string, data: UpdateQueueBody, updatedBy: string): Promise<Queue | undefined>
  delete(id: string): Promise<boolean>
}

export class QueuesRepository implements QueuesRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(data: CreateQueueBody, createdBy: string): Promise<Queue> {
    const row = await this.db
      .insertInto('ticket_queues')
      .values({
        name: data.name,
        created_by: createdBy,
        ...(data.filters !== undefined && { filters: JSON.stringify(data.filters) }),
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return toQueue(row)
  }

  async findById(id: string): Promise<Queue | undefined> {
    const row = await this.db
      .selectFrom('ticket_queues')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()

    return row ? toQueue(row) : undefined
  }

  async findMany(query: ListQueuesQuery): Promise<{ data: Queue[]; total: number }> {
    const offset = (query.page - 1) * query.pageSize

    const base = this.db.selectFrom('ticket_queues').$if(!!query.name, (q) => {
      const pattern = `%${query.name!.replace(/[\\%_]/g, '\\$&')}%`
      return q.where('name', 'ilike', pattern)
    })

    const rows = await base
      .selectAll()
      .select(sql<string>`count(*) over ()`.as('total_count'))
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(query.pageSize)
      .offset(offset)
      .execute()

    if (rows.length > 0) {
      return {
        data: rows.map((row) => toQueue(row as unknown as Selectable<TicketQueues>)),
        total: Number(rows[0].total_count),
      }
    }

    const { count } = await base
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow()

    return { data: [], total: Number(count) }
  }

  async update(id: string, data: UpdateQueueBody, updatedBy: string): Promise<Queue | undefined> {
    const row = await this.db
      .updateTable('ticket_queues')
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.filters !== undefined && { filters: JSON.stringify(data.filters) }),
        updated_by: updatedBy,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    return row ? toQueue(row) : undefined
  }

  async delete(id: string): Promise<boolean> {
    try {
      const [result] = await this.db.deleteFrom('ticket_queues').where('id', '=', id).execute()

      return (result?.numDeletedRows ?? 0n) > 0n
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === PG_FK_VIOLATION) {
        throw new ConflictError(`Queue ${id} still has groups`)
      }
      throw err
    }
  }
}

function toQueueGroup(row: Selectable<TicketQueuesXGroup>): QueueGroup {
  return {
    queueId: row.queue_id,
    groupId: row.group_id,
    createdAt: row.created_at.toISOString(),
  }
}

export interface QueueGroupsRepositoryPort {
  add(queueId: string, groupId: string): Promise<QueueGroup>
  remove(queueId: string, groupId: string): Promise<boolean>
}

export class QueueGroupsRepository implements QueueGroupsRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async add(queueId: string, groupId: string): Promise<QueueGroup> {
    let row: Selectable<TicketQueuesXGroup> | undefined

    try {
      row = await this.db
        .insertInto('ticket_queues_x_group')
        .values({ queue_id: queueId, group_id: groupId })
        .onConflict((oc) => oc.columns(['queue_id', 'group_id']).doNothing())
        .returningAll()
        .executeTakeFirst()
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === PG_FK_VIOLATION) {
        if ('constraint' in err && err.constraint === 'ticket_queues_x_group_group_id_fkey') {
          throw new NotFoundError(`Group ${groupId} not found`)
        }
        throw new NotFoundError(`Queue ${queueId} not found`)
      }
      throw err
    }

    if (!row) {
      throw new ConflictError(`Group ${groupId} is already linked to queue ${queueId}`)
    }

    return toQueueGroup(row)
  }

  async remove(queueId: string, groupId: string): Promise<boolean> {
    const [result] = await this.db
      .deleteFrom('ticket_queues_x_group')
      .where('queue_id', '=', queueId)
      .where('group_id', '=', groupId)
      .execute()

    return (result?.numDeletedRows ?? 0n) > 0n
  }
}
