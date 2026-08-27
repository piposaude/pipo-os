import { NotFoundError } from '../../shared/errors.js'
import type { GroupMembersRepositoryPort, GroupsRepositoryPort } from './repository.js'
import type {
  AddMemberBody,
  CreateGroupBody,
  Group,
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
    return this.repository.create(data, createdBy)
  }

  async get(id: string): Promise<Group> {
    const group = await this.repository.findById(id)
    if (!group) throw new NotFoundError(`Group ${id} not found`)
    return group
  }

  async list(query: ListGroupsQuery): Promise<GroupList> {
    const { data, total } = await this.repository.findMany(query)
    return { data, total, page: query.page, pageSize: query.pageSize }
  }

  async update(id: string, data: UpdateGroupBody, updatedBy: string): Promise<Group> {
    const group = await this.repository.update(id, data, updatedBy)
    if (!group) throw new NotFoundError(`Group ${id} not found`)
    return group
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id)
    if (!deleted) throw new NotFoundError(`Group ${id} not found`)
  }

  addMember(groupId: string, body: AddMemberBody): Promise<GroupMember> {
    return this.membersRepository.add(groupId, body.userId)
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
