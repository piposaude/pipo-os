import { sql, type Kysely, type Selectable } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { TicketGroupMembers, TicketGroups } from '../../infrastructure/db-types.js'
import { ConflictError, NotFoundError } from '../../shared/errors.js'
import type {
  CreateGroupBody,
  Group,
  GroupMember,
  ListGroupsQuery,
  UpdateGroupBody,
  UpdateMemberBody,
} from './schemas.js'

const PG_FK_VIOLATION = '23503'

function toGroup(row: Selectable<TicketGroups>): Group {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function toMember(row: Selectable<TicketGroupMembers>): GroupMember {
  return {
    groupId: row.group_id,
    userId: row.user_id,
    active: row.active,
    createdAt: row.created_at.toISOString(),
  }
}

export interface GroupsRepositoryPort {
  create(data: CreateGroupBody, createdBy: string): Promise<Group>
  findById(id: string): Promise<Group | undefined>
  findMany(query: ListGroupsQuery): Promise<{ data: Group[]; total: number }>
  update(id: string, data: UpdateGroupBody): Promise<Group | undefined>
  delete(id: string): Promise<boolean>
}

export class GroupsRepository implements GroupsRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(data: CreateGroupBody, createdBy: string): Promise<Group> {
    const row = await this.db
      .insertInto('ticket_groups')
      .values({ name: data.name, created_by: createdBy })
      .returningAll()
      .executeTakeFirstOrThrow()

    return toGroup(row)
  }

  async findById(id: string): Promise<Group | undefined> {
    const row = await this.db
      .selectFrom('ticket_groups')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()

    return row ? toGroup(row) : undefined
  }

  async findMany(query: ListGroupsQuery): Promise<{ data: Group[]; total: number }> {
    const offset = (query.page - 1) * query.pageSize

    const base = this.db.selectFrom('ticket_groups').$if(!!query.name, (q) => {
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
        data: rows.map((row) => toGroup(row as unknown as Selectable<TicketGroups>)),
        total: Number(rows[0].total_count),
      }
    }

    const { count } = await base
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .executeTakeFirstOrThrow()

    return { data: [], total: Number(count) }
  }

  async update(id: string, data: UpdateGroupBody): Promise<Group | undefined> {
    const row = await this.db
      .updateTable('ticket_groups')
      .set({ name: data.name })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    return row ? toGroup(row) : undefined
  }

  async delete(id: string): Promise<boolean> {
    try {
      const [result] = await this.db.deleteFrom('ticket_groups').where('id', '=', id).execute()

      return (result?.numDeletedRows ?? 0n) > 0n
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === PG_FK_VIOLATION) {
        throw new ConflictError(`Group ${id} still has members`)
      }
      throw err
    }
  }
}

export interface GroupMembersRepositoryPort {
  add(groupId: string, userId: string): Promise<GroupMember>
  remove(groupId: string, userId: string): Promise<boolean>
  update(groupId: string, userId: string, data: UpdateMemberBody): Promise<GroupMember | undefined>
}

export class GroupMembersRepository implements GroupMembersRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async add(groupId: string, userId: string): Promise<GroupMember> {
    try {
      const row = await this.db
        .insertInto('ticket_group_members')
        .values({ group_id: groupId, user_id: userId })
        .onConflict((oc) => oc.columns(['group_id', 'user_id']).doNothing())
        .returningAll()
        .executeTakeFirst()

      if (!row) {
        throw new ConflictError(`User ${userId} is already a member of group ${groupId}`)
      }

      return toMember(row)
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === PG_FK_VIOLATION) {
        throw new NotFoundError(`Group ${groupId} not found`)
      }
      throw err
    }
  }

  async remove(groupId: string, userId: string): Promise<boolean> {
    const [result] = await this.db
      .deleteFrom('ticket_group_members')
      .where('group_id', '=', groupId)
      .where('user_id', '=', userId)
      .execute()

    return (result?.numDeletedRows ?? 0n) > 0n
  }

  async update(
    groupId: string,
    userId: string,
    data: UpdateMemberBody,
  ): Promise<GroupMember | undefined> {
    const row = await this.db
      .updateTable('ticket_group_members')
      .set({ active: data.active })
      .where('group_id', '=', groupId)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirst()

    return row ? toMember(row) : undefined
  }
}
