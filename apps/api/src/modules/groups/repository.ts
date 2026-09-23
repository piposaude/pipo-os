import { sql, type Kysely, type Selectable } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { TicketGroupMembers, TicketGroups } from '../../infrastructure/db-types.js'
import { ADVISORY_LOCKS } from '../../shared/advisory-locks.js'
import { ConflictError, NotFoundError } from '../../shared/errors.js'
import { FK_VIOLATION } from '../../shared/pg.js'
import type { GroupNode } from './hierarchy.js'
import type {
  AddMemberBody,
  CreateGroupBody,
  Group,
  GroupDetailMember,
  GroupMember,
  ListGroupsQuery,
  MemberRole,
  UpdateGroupBody,
  UpdateMemberBody,
} from './schemas.js'

/** Both maps are keyed by group id, not by user id. */
export interface GroupRelations {
  companyIds: Map<string, string[]>
  members: Map<string, GroupDetailMember[]>
}

/** Five tables point at ticket_groups and all of them block the delete, so the
 *  constraint name is the only thing that says which link refused. */
const BLOCKING_LINKS: Record<string, string> = {
  ticket_group_members_group_id_fkey: 'still has members',
  ticket_groups_parent_id_fkey: 'still has child groups',
  ticket_group_companies_group_id_fkey: 'still carries companies',
  ticket_queues_group_id_fkey: 'still owns saved views',
  tickets_group_id_fkey: 'still has tickets',
}

function toGroup(row: Selectable<TicketGroups>): Group {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

/** NO KEY UPDATE, not UPDATE: it still lets the FKs of other writers into the
 *  group take their KEY SHARE, so it only serialises portfolio writes. */
async function lockGroup(db: Kysely<Database>, id: string): Promise<boolean> {
  const row = await db
    .selectFrom('ticket_groups')
    .select('id')
    .where('id', '=', id)
    .forNoKeyUpdate()
    .executeTakeFirst()
  return row !== undefined
}

async function carryCompanies(
  db: Kysely<Database>,
  groupId: string,
  companyIds: readonly string[],
): Promise<void> {
  if (companyIds.length === 0) return

  await db
    .insertInto('ticket_group_companies')
    .values(companyIds.map((companyId) => ({ group_id: groupId, company_id: companyId })))
    .onConflict((oc) => oc.column('company_id').doNothing())
    .execute()

  const owners = await db
    .selectFrom('ticket_group_companies as c')
    .innerJoin('ticket_groups as g', 'g.id', 'c.group_id')
    .select(['c.company_id', 'g.id', 'g.name'])
    .where('c.company_id', 'in', companyIds)
    .where('c.group_id', '<>', groupId)
    .orderBy('c.company_id')
    .execute()

  if (owners.length > 0) {
    const taken = owners.map((o) => `${o.company_id} belongs to ${o.name} (${o.id})`)
    throw new ConflictError(`Companies already carried by another group: ${taken.join('; ')}`)
  }
}

function toMember(row: Selectable<TicketGroupMembers>): GroupMember {
  return {
    groupId: row.group_id,
    userId: row.user_id,
    // The column is text; the CHECK of migration 0024 is what narrows it.
    role: row.role as MemberRole,
    active: row.active,
    createdAt: row.created_at.toISOString(),
  }
}

export interface GroupsRepositoryPort {
  create(data: CreateGroupBody, createdBy: string): Promise<Group>
  findById(id: string): Promise<Group | undefined>
  findMany(query: ListGroupsQuery): Promise<{ data: Group[]; total: number }>
  findNodes(): Promise<GroupNode[]>
  withHierarchyLock<T>(fn: (repository: GroupsRepositoryPort) => Promise<T>): Promise<T>
  findRelations(groupIds: readonly string[]): Promise<GroupRelations>
  update(id: string, data: UpdateGroupBody, updatedBy: string): Promise<Group | undefined>
  replaceCompanies(id: string, companyIds: readonly string[]): Promise<boolean>
  delete(id: string): Promise<boolean>
}

export class GroupsRepository implements GroupsRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(data: CreateGroupBody, createdBy: string): Promise<Group> {
    const row = await this.db
      .insertInto('ticket_groups')
      .values({ name: data.name, parent_id: data.parentId ?? null, created_by: createdBy })
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

  /** Every writer of the hierarchy takes this key, and the read that validates
   *  runs inside it — which needs READ COMMITTED to see the last holder's write. */
  withHierarchyLock<T>(fn: (repository: GroupsRepositoryPort) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(${ADVISORY_LOCKS.groupHierarchy})`.execute(trx)
      return fn(new GroupsRepository(trx))
    })
  }

  async findNodes(): Promise<GroupNode[]> {
    const rows = await this.db.selectFrom('ticket_groups').select(['id', 'parent_id']).execute()

    return rows.map((row) => ({ id: row.id, parentId: row.parent_id }))
  }

  /** Two queries for a whole page, never one per group. */
  async findRelations(groupIds: readonly string[]): Promise<GroupRelations> {
    const companyIds = new Map<string, string[]>()
    const members = new Map<string, GroupDetailMember[]>()
    if (groupIds.length === 0) return { companyIds, members }

    const carried = await this.db
      .selectFrom('ticket_group_companies')
      .select(['group_id', 'company_id'])
      .where('group_id', 'in', groupIds)
      .orderBy('company_id')
      .execute()

    for (const row of carried) {
      const list = companyIds.get(row.group_id) ?? []
      list.push(row.company_id)
      companyIds.set(row.group_id, list)
    }

    const rows = await this.db
      .selectFrom('ticket_group_members as m')
      .leftJoin('ticket_group_member_companies as mc', (join) =>
        join.onRef('mc.group_id', '=', 'm.group_id').onRef('mc.user_id', '=', 'm.user_id'),
      )
      .select(['m.group_id', 'm.user_id', 'm.role', 'm.active', 'mc.company_id'])
      .where('m.group_id', 'in', groupIds)
      .orderBy('m.group_id')
      // The loop below appends to the last member of the list instead of
      // looking it up, so a member's rows have to arrive contiguous.
      .orderBy('m.user_id')
      .orderBy('mc.company_id')
      .execute()

    for (const row of rows) {
      const list = members.get(row.group_id) ?? []
      let member = list.at(-1)
      if (member?.userId !== row.user_id) {
        member = {
          userId: row.user_id,
          role: row.role as MemberRole,
          active: row.active,
          companyIds: [],
        }
        list.push(member)
        members.set(row.group_id, list)
      }
      if (row.company_id !== null) member.companyIds.push(row.company_id)
    }

    return { companyIds, members }
  }

  async update(id: string, data: UpdateGroupBody, updatedBy: string): Promise<Group | undefined> {
    const row = await this.db
      .updateTable('ticket_groups')
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.parentId !== undefined && { parent_id: data.parentId }),
        updated_by: updatedBy,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst()

    return row ? toGroup(row) : undefined
  }

  replaceCompanies(id: string, companyIds: readonly string[]): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      if (!(await lockGroup(trx, id))) return false

      await trx
        .deleteFrom('ticket_group_companies')
        .where('group_id', '=', id)
        .$if(companyIds.length > 0, (q) => q.where('company_id', 'not in', companyIds))
        .execute()

      await carryCompanies(trx, id, companyIds)
      return true
    })
  }

  async delete(id: string): Promise<boolean> {
    try {
      const [result] = await this.db.deleteFrom('ticket_groups').where('id', '=', id).execute()

      return (result?.numDeletedRows ?? 0n) > 0n
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === FK_VIOLATION) {
        const constraint = 'constraint' in err ? String(err.constraint) : ''
        throw new ConflictError(
          `Group ${id} ${BLOCKING_LINKS[constraint] ?? 'is still referenced elsewhere'}`,
        )
      }
      throw err
    }
  }
}

/** A person's place in the structure: the pod and the role they hold in it. */
export interface Membership {
  groupId: string
  role: MemberRole
}

export interface GroupMembersRepositoryPort {
  add(groupId: string, data: AddMemberBody): Promise<GroupMember>
  remove(groupId: string, userId: string): Promise<boolean>
  update(groupId: string, userId: string, data: UpdateMemberBody): Promise<GroupMember | undefined>
  listByUser(userId: string): Promise<Membership[]>
}

export class GroupMembersRepository implements GroupMembersRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async add(groupId: string, { userId, role }: AddMemberBody): Promise<GroupMember> {
    try {
      const row = await this.db
        .insertInto('ticket_group_members')
        .values({ group_id: groupId, user_id: userId, ...(role !== undefined && { role }) })
        .onConflict((oc) => oc.columns(['group_id', 'user_id']).doNothing())
        .returningAll()
        .executeTakeFirst()

      if (!row) {
        throw new ConflictError(`User ${userId} is already a member of group ${groupId}`)
      }

      return toMember(row)
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === FK_VIOLATION) {
        throw new NotFoundError(`Group ${groupId} not found`)
      }
      throw err
    }
  }

  // Active only: a deactivated membership is history, and reading it as current
  // would hand the person a pod they no longer answer for.
  async listByUser(userId: string): Promise<Membership[]> {
    const rows = await this.db
      .selectFrom('ticket_group_members')
      .select(['group_id', 'role'])
      .where('user_id', '=', userId)
      .where('active', '=', true)
      .orderBy('group_id')
      .execute()

    return rows.map((row) => ({ groupId: row.group_id, role: row.role as MemberRole }))
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
      .set({
        ...(data.active !== undefined && { active: data.active }),
        ...(data.role !== undefined && { role: data.role }),
      })
      .where('group_id', '=', groupId)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirst()

    return row ? toMember(row) : undefined
  }
}
