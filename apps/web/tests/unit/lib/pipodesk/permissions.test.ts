// @vitest-environment node
import {
  ancestorsOf,
  analystsOf,
  canEditQueue,
  canEditStructure,
  childGroupsOf,
  membersOf,
  rootGroupOf,
  type Structure,
} from '@/lib/pipodesk/permissions'

const structure: Structure = {
  groups: [
    { id: 'geben', name: 'Gestão de Benefícios', parentId: null, companyIds: [] },
    { id: 'pod-1', name: 'POD 1', parentId: 'geben', companyIds: [] },
    { id: 'pod-5', name: 'POD 5', parentId: 'geben', companyIds: [] },
  ],
  memberships: [
    { userId: 'juliana@pipo.health', groupId: 'geben', role: 'admin' },
    { userId: 'ana@pipo.health', groupId: 'pod-5', role: 'member' },
    { userId: 'bruno@pipo.health', groupId: 'pod-5', role: 'admin' },
  ],
}

describe('canEditStructure', () => {
  it('should let an admin of the root group edit any subteam', () => {
    expect(canEditStructure(structure, 'juliana@pipo.health', 'pod-5')).toBe(true)
    expect(canEditStructure(structure, 'juliana@pipo.health', 'pod-1')).toBe(true)
    expect(canEditStructure(structure, 'juliana@pipo.health', 'geben')).toBe(true)
  })

  it('should let an admin of a pod edit that pod', () => {
    expect(canEditStructure(structure, 'bruno@pipo.health', 'pod-5')).toBe(true)
  })

  it('should not let a pod admin edit a sibling pod or the root', () => {
    expect(canEditStructure(structure, 'bruno@pipo.health', 'pod-1')).toBe(false)
    expect(canEditStructure(structure, 'bruno@pipo.health', 'geben')).toBe(false)
  })

  it('should not let a plain member edit any structure', () => {
    expect(canEditStructure(structure, 'ana@pipo.health', 'pod-5')).toBe(false)
    expect(canEditStructure(structure, 'ana@pipo.health', 'geben')).toBe(false)
  })

  it('should not loop forever when parentId forms a cycle', () => {
    const cyclic: Structure = {
      groups: [
        { id: 'a', name: 'A', parentId: 'b', companyIds: [] },
        { id: 'b', name: 'B', parentId: 'a', companyIds: [] },
      ],
      memberships: [],
    }

    expect(canEditStructure(cyclic, 'ana@pipo.health', 'a')).toBe(false)
  })
})

describe('canEditQueue', () => {
  it('should let only the owner edit a personal view', () => {
    const personal = { id: 'q1', groupId: 'pod-5', ownerId: 'ana@pipo.health' }

    expect(canEditQueue(personal, structure, 'ana@pipo.health')).toBe(true)
    expect(canEditQueue(personal, structure, 'bruno@pipo.health')).toBe(false)
    expect(canEditQueue(personal, structure, 'juliana@pipo.health')).toBe(false)
  })

  it('should let the group admin, or an admin above it, edit a team view', () => {
    const team = { id: 'q2', groupId: 'pod-5', ownerId: null }

    expect(canEditQueue(team, structure, 'bruno@pipo.health')).toBe(true)
    expect(canEditQueue(team, structure, 'juliana@pipo.health')).toBe(true)
    expect(canEditQueue(team, structure, 'ana@pipo.health')).toBe(false)
  })
})

describe('selectors', () => {
  it('should find the root group', () => {
    expect(rootGroupOf(structure)?.id).toBe('geben')
  })

  it('should return null instead of throwing when there is no root group', () => {
    expect(rootGroupOf({ groups: [], memberships: [] })).toBeNull()
  })

  it('should list the children of a group', () => {
    expect(childGroupsOf(structure, 'geben').map((g) => g.id)).toEqual(['pod-1', 'pod-5'])
    expect(childGroupsOf(structure, 'pod-5')).toEqual([])
  })

  it('should list the members of a group, and the analysts apart from the coordination', () => {
    expect(membersOf(structure, 'pod-5').map((m) => m.userId)).toEqual([
      'ana@pipo.health',
      'bruno@pipo.health',
    ])
    expect(analystsOf(structure, 'pod-5').map((m) => m.userId)).toEqual(['ana@pipo.health'])
  })

  it('should list the ancestors of a group, closest first', () => {
    expect(ancestorsOf(structure, 'pod-5').map((g) => g.id)).toEqual(['geben'])
    expect(ancestorsOf(structure, 'geben')).toEqual([])
  })
})
