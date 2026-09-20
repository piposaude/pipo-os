import { sql, type ExpressionBuilder, type Kysely, type Selectable } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { TicketQueues } from '../../infrastructure/db-types.js'
import { ValidationFailedError } from '../../shared/errors.js'
import { FK_VIOLATION } from '../../shared/pg.js'
import { ticketFilterSchema } from '../tickets/filter-schema.js'
import type { CreateQueueBody, Queue, ListQueuesQuery, UpdateQueueBody } from './schemas.js'
import type { QueueGroupBy, SortDirection, SortField } from './view-vocabulary.js'

/** The write names a group that is not there. Rethrown as a field error so the
 *  caller gets 422 pointing at `groupId`, not 500. */
function rethrowMissingGroup(err: unknown): never {
  if (err instanceof Error && 'code' in err && err.code === FK_VIOLATION) {
    throw new ValidationFailedError('groupId does not exist', [
      { field: 'groupId', message: 'groupId does not exist', code: 'not-found' },
    ])
  }
  throw err
}

/** The viewer's own star, as a correlated EXISTS, so a page of views costs the
 *  same one query it did before. Kysely types it as SqlBool, hence the Boolean. */
const starredBy = (eb: ExpressionBuilder<Database, 'ticket_queues'>, viewerId: string) =>
  eb.exists(
    eb
      .selectFrom('ticket_queue_favorites as f')
      .select('f.queue_id')
      .whereRef('f.queue_id', '=', 'ticket_queues.id')
      .where('f.user_id', '=', viewerId),
  )

/** A personal view belongs to one sidebar. Listings carry this; reading one by
 *  id does not, so editing someone else's answers 403 and not 404. */
const visibleTo = (eb: ExpressionBuilder<Database, 'ticket_queues'>, viewerId: string) =>
  eb.or([eb('owner_id', 'is', null), eb('owner_id', '=', viewerId)])

function toQueue(row: Selectable<TicketQueues>, favorite: boolean): Queue {
  const filters = ticketFilterSchema.safeParse(row.filters)
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    groupId: row.group_id,
    filters: filters.success ? filters.data : null,
    // The columns are text; the CHECKs of migration 0027 are what narrow them.
    sort: { by: row.sort_by as SortField, direction: row.sort_direction as SortDirection },
    groupBy: row.group_by as QueueGroupBy | null,
    favorite,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

export interface QueuesRepositoryPort {
  create(data: CreateQueueBody, createdBy: string): Promise<Queue>
  findById(id: string, viewerId: string): Promise<Queue | undefined>
  findMany(query: ListQueuesQuery, viewerId: string): Promise<{ data: Queue[]; total: number }>
  findByIds(ids: readonly string[], viewerId: string): Promise<Queue[]>
  update(id: string, data: UpdateQueueBody, updatedBy: string): Promise<Queue | undefined>
  delete(id: string): Promise<boolean>
  favorite(queueId: string, userId: string): Promise<void>
  unfavorite(queueId: string, userId: string): Promise<void>
}

export class QueuesRepository implements QueuesRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(data: CreateQueueBody, createdBy: string): Promise<Queue> {
    try {
      const row = await this.db
        .insertInto('ticket_queues')
        .values({
          name: data.name,
          created_by: createdBy,
          ...(data.ownerId !== undefined && { owner_id: data.ownerId }),
          ...(data.groupId !== undefined && { group_id: data.groupId }),
          ...(data.filters !== undefined && { filters: JSON.stringify(data.filters) }),
          ...(data.sort !== undefined && {
            sort_by: data.sort.by,
            sort_direction: data.sort.direction,
          }),
          ...(data.groupBy !== undefined && { group_by: data.groupBy }),
        })
        .returningAll()
        .executeTakeFirstOrThrow()

      // A view is born unstarred: the id did not exist a moment ago.
      return toQueue(row, false)
    } catch (err) {
      rethrowMissingGroup(err)
    }
  }

  async findById(id: string, viewerId: string): Promise<Queue | undefined> {
    const row = await this.db
      .selectFrom('ticket_queues')
      .selectAll()
      .select((eb) => starredBy(eb, viewerId).as('favorite'))
      .where('id', '=', id)
      .executeTakeFirst()

    return row ? toQueue(row, Boolean(row.favorite)) : undefined
  }

  async findByIds(ids: readonly string[], viewerId: string): Promise<Queue[]> {
    const rows = await this.db
      .selectFrom('ticket_queues')
      .selectAll()
      .select((eb) => starredBy(eb, viewerId).as('favorite'))
      .where('id', 'in', ids)
      .where((eb) => visibleTo(eb, viewerId))
      .execute()

    return rows.map((row) => toQueue(row, Boolean(row.favorite)))
  }

  async findMany(
    query: ListQueuesQuery,
    viewerId: string,
  ): Promise<{ data: Queue[]; total: number }> {
    const offset = (query.page - 1) * query.pageSize

    const base = this.db
      .selectFrom('ticket_queues')
      .$if(!!query.name, (q) => {
        const pattern = `%${query.name!.replace(/[\\%_]/g, '\\$&')}%`
        return q.where('name', 'ilike', pattern)
      })
      .where((eb) => visibleTo(eb, viewerId))
      .$if(query.favorite !== undefined, (q) =>
        q.where((eb) => {
          const starred = starredBy(eb, viewerId)
          return query.favorite === true ? starred : eb.not(starred)
        }),
      )

    const rows = await base
      .selectAll()
      .select((eb) => starredBy(eb, viewerId).as('favorite'))
      .select(sql<string>`count(*) over ()`.as('total_count'))
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(query.pageSize)
      .offset(offset)
      .execute()

    if (rows.length > 0) {
      return {
        data: rows.map((row) => toQueue(row, Boolean(row.favorite))),
        total: Number(rows[0].total_count),
      }
    }

    const { count } = await base
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow()

    return { data: [], total: Number(count) }
  }

  async update(id: string, data: UpdateQueueBody, updatedBy: string): Promise<Queue | undefined> {
    try {
      const row = await this.db
        .updateTable('ticket_queues')
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.ownerId !== undefined && { owner_id: data.ownerId }),
          ...(data.groupId !== undefined && { group_id: data.groupId }),
          ...(data.filters !== undefined && { filters: JSON.stringify(data.filters) }),
          ...(data.sort !== undefined && {
            sort_by: data.sort.by,
            sort_direction: data.sort.direction,
          }),
          ...(data.groupBy !== undefined && { group_by: data.groupBy }),
          updated_by: updatedBy,
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst()

      return row ? toQueue(row, await this.isFavorite(id, updatedBy)) : undefined
    } catch (err) {
      rethrowMissingGroup(err)
    }
  }

  private async isFavorite(queueId: string, userId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('ticket_queue_favorites')
      .select('queue_id')
      .where('queue_id', '=', queueId)
      .where('user_id', '=', userId)
      .executeTakeFirst()

    return row !== undefined
  }

  async favorite(queueId: string, userId: string): Promise<void> {
    await this.db
      .insertInto('ticket_queue_favorites')
      .values({ queue_id: queueId, user_id: userId })
      .onConflict((oc) => oc.columns(['user_id', 'queue_id']).doNothing())
      .execute()
  }

  async unfavorite(queueId: string, userId: string): Promise<void> {
    await this.db
      .deleteFrom('ticket_queue_favorites')
      .where('queue_id', '=', queueId)
      .where('user_id', '=', userId)
      .execute()
  }

  async delete(id: string): Promise<boolean> {
    const [result] = await this.db.deleteFrom('ticket_queues').where('id', '=', id).execute()

    return (result?.numDeletedRows ?? 0n) > 0n
  }
}
