// @vitest-environment node
import {
  unownedCompaniesOf,
  portfolioOf,
  membersWithLoad,
  operationRoster,
  candidatesFor,
  elsewhereOf,
  joinTargets,
} from '@/lib/pipodesk/team'
import type { StructureState } from '@/lib/pipodesk/structure'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'

const structure: StructureState = {
  groups: [
    { id: 'geben', name: 'GEBEN', parentId: null, companyIds: [] },
    { id: 'pod-1', name: 'POD 1', parentId: 'geben', companyIds: ['a', 'b', 'c', 'd'] },
  ],
  memberships: [
    { userId: 'bruno@pipo', groupId: 'pod-1', role: 'admin' },
    { userId: 'carla@pipo', groupId: 'pod-1', role: 'member', companyIds: ['a', 'b'] },
    { userId: 'tainá@pipo', groupId: 'pod-1', role: 'member', companyIds: ['c'] },
  ],
  queues: [],
}

const row = (overrides: Partial<TicketRow> & Pick<TicketRow, 'id'>): TicketRow => ({
  displayNumber: null,
  enrollmentId: 'e',
  companyId: 'a',
  status: 'broker-processing',
  display: 'broker-processing',
  reason: null,
  subject: 's',
  beneficiaryName: null,
  taxId: null,
  companyName: null,
  parentCompanyId: null,
  parentCompanyName: null,
  companyTaxId: null,
  companySize: null,
  carrierId: null,
  carrierName: null,
  product: null,
  enrollmentType: 'inclusion',
  contractType: 'clt',
  relationship: 'holder',
  assigneeId: null,
  groupId: 'pod-1',
  priority: null,
  actionDate: null,
  tags: [],
  sourceSystem: 'ei',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  closedAt: null,
  ...overrides,
})

describe('unownedCompaniesOf', () => {
  /** The pod's coordination debt: portfolio companies nobody carries. Their
   *  tickets DO have owners (rotation); the company does not. */
  it('should list the companies of the pod that no member carries', () => {
    const rows = [
      row({ id: '1', companyId: 'd' }),
      row({ id: '2', companyId: 'd' }),
      row({ id: '3', companyId: 'a' }),
    ]

    expect(unownedCompaniesOf(structure, 'pod-1', rows)).toEqual({ companies: 1, tickets: 2 })
  })

  it('should count nothing when every company of the pod has someone', () => {
    const full: StructureState = {
      ...structure,
      memberships: [
        {
          userId: 'carla@pipo',
          groupId: 'pod-1',
          role: 'member',
          companyIds: ['a', 'b', 'c', 'd'],
        },
      ],
    }

    expect(unownedCompaniesOf(full, 'pod-1', [row({ id: '1' })])).toEqual({
      companies: 0,
      tickets: 0,
    })
  })

  /** The root group's debt is a different one — promising one warning while
   *  delivering another teaches people to ignore warnings. */
  it('should return nothing for the root group, whose pending question is another one', () => {
    expect(unownedCompaniesOf(structure, 'geben', [row({ id: '1' })])).toEqual({
      companies: 0,
      tickets: 0,
    })
  })
})

describe('portfolioOf', () => {
  it('should give the companies of a membership, empty for coordination', () => {
    expect(portfolioOf(structure, 'pod-1', 'carla@pipo')).toEqual(['a', 'b'])
    expect(portfolioOf(structure, 'pod-1', 'bruno@pipo')).toEqual([])
  })
})

describe('membersWithLoad', () => {
  it('should put coordination first, then the analysts by open load', () => {
    const rows = [
      row({ id: '1', assigneeId: 'tainá@pipo' }),
      row({ id: '2', assigneeId: 'tainá@pipo' }),
      row({ id: '3', assigneeId: 'carla@pipo' }),
      // Closed does not count: the column is "open".
      row({ id: '4', assigneeId: 'carla@pipo', closedAt: '2026-08-10T10:00:00.000Z' }),
    ]

    expect(membersWithLoad(structure, 'pod-1', rows)).toEqual([
      { userId: 'bruno@pipo', role: 'admin', companies: 0, open: 0, shared: 0 },
      { userId: 'tainá@pipo', role: 'member', companies: 1, open: 2, shared: 0 },
      { userId: 'carla@pipo', role: 'member', companies: 2, open: 1, shared: 1 },
    ])
  })
})

describe('shared companies', () => {
  /** From November each client has a single analyst; the page warns about the
   *  clients that still have more than one, it does not block. */
  it('should count the companies of a person that another analyst also holds open work for', () => {
    const rows = [
      row({ id: '1', companyId: 'a', assigneeId: 'carla@pipo' }),
      row({ id: '2', companyId: 'a', assigneeId: 'tainá@pipo' }),
      row({ id: '3', companyId: 'b', assigneeId: 'carla@pipo' }),
      // Closed work is not "holding" the client.
      row({ id: '4', companyId: 'b', assigneeId: 'tainá@pipo', closedAt: '2026-08-10T10:00:00Z' }),
    ]

    const load = membersWithLoad(structure, 'pod-1', rows)
    expect(load.find((line) => line.userId === 'carla@pipo')?.shared).toBe(1)
    // `c` is Tainá's portfolio, and nobody else works it.
    expect(load.find((line) => line.userId === 'tainá@pipo')?.shared).toBe(0)
  })
})

describe('operationRoster', () => {
  const operation: StructureState = {
    groups: [
      { id: 'geben', name: 'GEBEN', parentId: null, companyIds: [] },
      { id: 'pod-2', name: 'POD 2', parentId: 'geben', companyIds: ['e'] },
      { id: 'pod-1', name: 'POD 1', parentId: 'geben', companyIds: ['a', 'b'] },
    ],
    memberships: [
      { userId: 'bruno@pipo', groupId: 'geben', role: 'admin' },
      { userId: 'bruno@pipo', groupId: 'pod-1', role: 'admin' },
      { userId: 'carla@pipo', groupId: 'pod-2', role: 'member', companyIds: ['e'] },
      { userId: 'carla@pipo', groupId: 'pod-1', role: 'member', companyIds: ['a', 'b'] },
      { userId: 'ana@pipo', groupId: 'pod-2', role: 'member', companyIds: [] },
    ],
    queues: [],
  }
  const nameOf = (userId: string) => userId

  /** A membership is per group, and the root only holds coordination: the
   *  root's own members would list two people for the whole operation. */
  it('should give one line per person of the operation, with the pods they are in', () => {
    const roster = operationRoster(operation, [], nameOf)

    expect(roster.map((line) => line.userId)).toEqual(['bruno@pipo', 'carla@pipo', 'ana@pipo'])
    expect(roster[1]).toMatchObject({
      role: 'member',
      companies: 3,
      pods: [
        { id: 'pod-1', name: 'POD 1' },
        { id: 'pod-2', name: 'POD 2' },
      ],
    })
  })

  /** Coordination is admin wherever it is, and the root is not a pod. */
  it('should read as coordination anyone admin in some group, without listing the root as a pod', () => {
    expect(operationRoster(operation, [], nameOf)[0]).toMatchObject({
      role: 'admin',
      pods: [{ id: 'pod-1' }],
    })
  })

  /** On the operation's page the load is what the person holds in any pod. */
  it('should count the open tickets of each person across every pod', () => {
    const rows = [
      row({ id: '1', assigneeId: 'carla@pipo', groupId: 'pod-1' }),
      row({ id: '2', assigneeId: 'carla@pipo', groupId: 'pod-2' }),
      row({ id: '3', assigneeId: 'carla@pipo', closedAt: '2026-08-10T10:00:00.000Z' }),
    ]

    expect(operationRoster(operation, rows, nameOf)[1].open).toBe(2)
  })
})

describe('adding a person', () => {
  const operation: StructureState = {
    groups: [
      { id: 'geben', name: 'GEBEN', parentId: null, companyIds: [] },
      { id: 'pod-1', name: 'POD 1', parentId: 'geben', companyIds: ['a'] },
      { id: 'pod-2', name: 'POD 2', parentId: 'geben', companyIds: ['b', 'c'] },
    ],
    memberships: [
      { userId: 'bruno@pipo', groupId: 'geben', role: 'admin' },
      { userId: 'carla@pipo', groupId: 'pod-2', role: 'member', companyIds: ['b', 'c'] },
    ],
    queues: [],
  }
  const people = [
    { id: 'bruno@pipo', name: 'Bruno Lima' },
    { id: 'carla@pipo', name: 'Carla Antônia' },
    { id: 'ana@pipo', name: 'Ana Souza' },
  ]

  /** Offering only who is missing is what keeps the 409 of a repeated member
   *  out of the normal path. */
  it('should offer the people not yet in the group, matching the search without accents', () => {
    expect(candidatesFor(people, operation, 'pod-2', '').map((p) => p.id)).toEqual([
      'bruno@pipo',
      'ana@pipo',
    ])
    expect(candidatesFor(people, operation, 'pod-1', 'antonia').map((p) => p.id)).toEqual([
      'carla@pipo',
    ])
  })

  /** Being in two pods is allowed; doing it without seeing the first is not a
   *  decision anyone meant to take. */
  it('should say which other pods the person is in, and with how many companies', () => {
    expect(elsewhereOf(operation, 'carla@pipo', 'pod-1')).toEqual([{ name: 'POD 2', companies: 2 }])
    // The root is not a pod.
    expect(elsewhereOf(operation, 'bruno@pipo', 'pod-1')).toEqual([])
  })

  it('should add an analyst to the chosen pod only', () => {
    expect(joinTargets(operation, 'pod-1', 'member', 'ana@pipo')).toEqual([
      { groupId: 'pod-1', role: 'member' },
    ])
  })

  /** Coordination of the operation is admin in the root AND in every pod: each
   *  pod's page lists its own memberships, and coordination has to be there. */
  it('should make operation coordination admin in the root and in every pod', () => {
    expect(joinTargets(operation, 'geben', 'admin', 'ana@pipo')).toEqual([
      { groupId: 'geben', role: 'admin' },
      { groupId: 'pod-1', role: 'admin' },
      { groupId: 'pod-2', role: 'admin' },
    ])
  })

  /** A membership that already exists is left as it is: promoting to the
   *  operation does not turn someone's analyst seat into coordination. */
  it('should skip the groups where the person already has a membership', () => {
    expect(joinTargets(operation, 'geben', 'admin', 'carla@pipo')).toEqual([
      { groupId: 'geben', role: 'admin' },
      { groupId: 'pod-1', role: 'admin' },
    ])
  })
})
