import { describe, expect, it } from 'vitest'
import type {
  GroupMembersRepositoryPort,
  GroupRelations,
  GroupsRepositoryPort,
} from './repository.js'
import type { Group } from './schemas.js'
import { GroupsService } from './service.js'

const group = (id: string): Group => ({
  id,
  name: id,
  parentId: null,
  createdBy: 'test',
  updatedBy: null,
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
})

describe('groups service', () => {
  it('loads the relations of a whole page in one call, not one per group', async () => {
    let calls = 0
    const repository = {
      findMany: () => Promise.resolve({ data: [group('a'), group('b'), group('c')], total: 3 }),
      findRelations: (): Promise<GroupRelations> => {
        calls += 1
        return Promise.resolve({ companyIds: new Map(), members: new Map() })
      },
    } as unknown as GroupsRepositoryPort

    const service = new GroupsService(repository, {} as GroupMembersRepositoryPort)
    const list = await service.list({ page: 1, pageSize: 20 })

    expect(list.data).toHaveLength(3)
    expect(calls).toBe(1)
  })
})
