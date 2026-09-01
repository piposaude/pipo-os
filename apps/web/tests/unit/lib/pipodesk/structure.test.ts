// @vitest-environment node
import {
  favoriteQueuesOf,
  isFavorite,
  queuesOf,
  unallocatedCompanyIdsOf,
  type Queue,
  type StructureState,
} from '@/lib/pipodesk/structure'

const queue = (overrides: Partial<Queue> & Pick<Queue, 'id' | 'groupId'>): Queue => ({
  name: 'Uma view',
  ownerId: null,
  subscriberIds: [],
  filter: {},
  sort: { by: 'actionDate', direction: 'asc' },
  ...overrides,
})

const structure = (overrides: Partial<StructureState> = {}): StructureState => ({
  groups: [
    { id: 'geben', name: 'GEBEN', parentId: null, companyIds: [] },
    { id: 'pod-1', name: 'POD 1', parentId: 'geben', companyIds: ['empresa-a'] },
    { id: 'pod-2', name: 'POD 2', parentId: 'geben', companyIds: ['empresa-b'] },
  ],
  memberships: [],
  queues: [],
  ...overrides,
})

describe('queuesOf', () => {
  it('should return only the queues of that group, in declaration order', () => {
    const state = structure({
      queues: [
        queue({ id: 'q-1', groupId: 'pod-1', name: 'Urgentes' }),
        queue({ id: 'q-2', groupId: 'pod-2', name: 'Novos' }),
        queue({ id: 'q-3', groupId: 'pod-1', name: 'Em espera' }),
      ],
    })

    expect(queuesOf(state, 'pod-1').map((found) => found.name)).toEqual(['Urgentes', 'Em espera'])
  })
})

describe('isFavorite', () => {
  it('should read the subscription, not the ownership', () => {
    const mine = queue({ id: 'q-1', groupId: 'pod-1', ownerId: 'ana@pipo', subscriberIds: [] })
    const starred = queue({ id: 'q-2', groupId: 'pod-1', subscriberIds: ['ana@pipo'] })

    expect(isFavorite(mine, 'ana@pipo')).toBe(false)
    expect(isFavorite(starred, 'ana@pipo')).toBe(true)
  })
})

describe('favoriteQueuesOf', () => {
  it('should open empty until someone stars a view', () => {
    const state = structure({ queues: [queue({ id: 'q-1', groupId: 'pod-1' })] })

    expect(favoriteQueuesOf(state, 'ana@pipo')).toEqual([])
  })

  it('should list every queue the person subscribed to, across groups', () => {
    const state = structure({
      queues: [
        queue({ id: 'q-1', groupId: 'pod-1', name: 'Urgentes', subscriberIds: ['ana@pipo'] }),
        queue({ id: 'q-2', groupId: 'pod-2', name: 'Novos', subscriberIds: ['bia@pipo'] }),
        queue({ id: 'q-3', groupId: 'pod-2', name: 'Em espera', subscriberIds: ['ana@pipo'] }),
      ],
    })

    expect(favoriteQueuesOf(state, 'ana@pipo').map((found) => found.name)).toEqual([
      'Urgentes',
      'Em espera',
    ])
  })
})

describe('unallocatedCompanyIdsOf', () => {
  it('should return the companies no pod carries — the triage bucket', () => {
    const state = structure()

    expect(unallocatedCompanyIdsOf(state, ['empresa-a', 'empresa-b', 'empresa-c'])).toEqual([
      'empresa-c',
    ])
  })

  it('should ignore a company carried by more than one pod', () => {
    const state = structure({
      groups: [
        { id: 'geben', name: 'GEBEN', parentId: null, companyIds: [] },
        { id: 'pod-1', name: 'POD 1', parentId: 'geben', companyIds: ['empresa-a'] },
        { id: 'pod-2', name: 'POD 2', parentId: 'geben', companyIds: ['empresa-a'] },
      ],
    })

    expect(unallocatedCompanyIdsOf(state, ['empresa-a'])).toEqual([])
  })
})
