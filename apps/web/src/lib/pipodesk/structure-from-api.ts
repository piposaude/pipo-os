import type { TicketFilter } from './filter'
import type { GroupBy } from './group'
import type { MemberRole, Membership, Group } from './permissions'
import type { TicketSort } from './sort'
import type { Queue, StructureState } from './structure'

export interface ApiGroupMember {
  userId: string
  role: MemberRole
  active: boolean
  companyIds: string[]
}

export interface ApiGroup {
  id: string
  name: string
  parentId: string | null
  companyIds: string[]
  members: ApiGroupMember[]
}

export interface ApiQueue {
  id: string
  name: string
  groupId: string | null
  ownerId: string | null
  filters: TicketFilter | null
  sort: TicketSort
  groupBy: GroupBy | null
  favorite: boolean
}

export function structureFromApi(
  groups: ApiGroup[],
  queues: ApiQueue[],
  viewerId: string,
): StructureState {
  const structureGroups: Group[] = groups.map((group) => ({
    id: group.id,
    name: group.name,
    parentId: group.parentId,
    companyIds: group.companyIds,
  }))

  const memberships: Membership[] = groups.flatMap((group) =>
    group.members
      .filter((member) => member.active)
      .map((member) => ({
        userId: member.userId,
        groupId: group.id,
        role: member.role,
        companyIds: member.companyIds,
      })),
  )

  const structureQueues: Queue[] = []
  for (const view of queues) {
    if (view.groupId === null || view.filters === null) continue
    structureQueues.push({
      id: view.id,
      name: view.name,
      groupId: view.groupId,
      ownerId: view.ownerId,
      subscriberIds: view.favorite ? [viewerId] : [],
      filter: view.filters,
      sort: view.sort,
      ...(view.groupBy === null ? {} : { groupBy: view.groupBy }),
    })
  }

  return { groups: structureGroups, memberships, queues: structureQueues }
}
