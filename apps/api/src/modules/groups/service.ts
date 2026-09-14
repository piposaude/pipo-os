import { NotFoundError } from '../../shared/errors.js'
import { assertParentIsValid } from './hierarchy.js'
import type { GroupMembersRepositoryPort, GroupsRepositoryPort } from './repository.js'
import type {
  AddMemberBody,
  CreateGroupBody,
  Group,
  GroupDetail,
  GroupList,
  GroupMember,
  ListGroupsQuery,
  UpdateGroupBody,
  UpdateMemberBody,
} from './schemas.js'

export class GroupsService {
  constructor(
    private readonly repository: GroupsRepositoryPort,
    private readonly membersRepository: GroupMembersRepositoryPort,
  ) {}

  create(data: CreateGroupBody, createdBy: string): Promise<Group> {
    return this.repository.withHierarchyLock(async (repository) => {
      assertParentIsValid(await repository.findNodes(), data.parentId ?? null)
      return repository.create(data, createdBy)
    })
  }

  async get(id: string): Promise<GroupDetail> {
    const group = await this.repository.findById(id)
    if (!group) throw new NotFoundError(`Group ${id} not found`)
    const [detail] = await this.withRelations([group])
    return detail
  }

  async list(query: ListGroupsQuery): Promise<GroupList> {
    const { data, total } = await this.repository.findMany(query)
    return {
      data: await this.withRelations(data),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  private async withRelations(groups: readonly Group[]): Promise<GroupDetail[]> {
    const { companyIds, members } = await this.repository.findRelations(
      groups.map((group) => group.id),
    )

    return groups.map((group) => ({
      ...group,
      companyIds: companyIds.get(group.id) ?? [],
      members: members.get(group.id) ?? [],
    }))
  }

  async update(id: string, data: UpdateGroupBody, updatedBy: string): Promise<Group> {
    const { parentId } = data
    if (parentId === undefined)
      return this.updated(id, () => this.repository.update(id, data, updatedBy))

    return this.repository.withHierarchyLock(async (repository) => {
      const nodes = await repository.findNodes()
      if (!nodes.some((node) => node.id === id)) throw new NotFoundError(`Group ${id} not found`)
      assertParentIsValid(nodes, parentId, id)
      return this.updated(id, () => repository.update(id, data, updatedBy))
    })
  }

  private async updated(id: string, write: () => Promise<Group | undefined>): Promise<Group> {
    const group = await write()
    if (!group) throw new NotFoundError(`Group ${id} not found`)
    return group
  }

  delete(id: string): Promise<void> {
    return this.repository.withHierarchyLock(async (repository) => {
      const deleted = await repository.delete(id)
      if (!deleted) throw new NotFoundError(`Group ${id} not found`)
    })
  }

  addMember(groupId: string, body: AddMemberBody): Promise<GroupMember> {
    return this.membersRepository.add(groupId, body)
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    const removed = await this.membersRepository.remove(groupId, userId)
    if (!removed) throw new NotFoundError(`Member ${userId} not found in group ${groupId}`)
  }

  async updateMember(
    groupId: string,
    userId: string,
    data: UpdateMemberBody,
  ): Promise<GroupMember> {
    const member = await this.membersRepository.update(groupId, userId, data)
    if (!member) throw new NotFoundError(`Member ${userId} not found in group ${groupId}`)
    return member
  }
}
