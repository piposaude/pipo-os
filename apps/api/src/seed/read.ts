import type { GroupDetail } from '../modules/groups/schemas.js'
import type { CurrentQueue, CurrentStructure } from './plan.js'

interface Page<T> {
  data: T[]
  total: number
}

export interface SeedReader {
  listGroups(page: number, pageSize: number): Promise<Page<GroupDetail>>
  listQueues(page: number, pageSize: number): Promise<Page<CurrentQueue>>
}

async function drain<T>(
  load: (page: number, pageSize: number) => Promise<Page<T>>,
  pageSize: number,
): Promise<T[]> {
  const rows: T[] = []
  let page = 1

  for (;;) {
    const { data, total } = await load(page, pageSize)
    rows.push(...data)
    if (rows.length >= total || data.length === 0) {
      return rows
    }
    page += 1
  }
}

export async function readCurrent(reader: SeedReader, pageSize = 100): Promise<CurrentStructure> {
  const [groups, queues] = await Promise.all([
    drain((page, size) => reader.listGroups(page, size), pageSize),
    drain((page, size) => reader.listQueues(page, size), pageSize),
  ])

  return {
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      parentId: group.parentId,
    })),
    queues: queues.map((queue) => ({
      id: queue.id,
      name: queue.name,
      groupId: queue.groupId,
      ownerId: queue.ownerId,
      filters: queue.filters,
      sort: queue.sort,
    })),
    members: groups.flatMap((group) =>
      group.members.map((member) => ({ groupId: group.id, userId: member.userId })),
    ),
  }
}
