// @vitest-environment node
import { unownedCompaniesOf, portfolioOf, membersWithLoad } from '@/lib/pipodesk/team'
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

const row = (overrides: Partial<TicketRow> & Pick<TicketRow, 'id'>): TicketRow =>
  ({
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
  }) as TicketRow

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
      { userId: 'bruno@pipo', role: 'admin', companies: 0, open: 0 },
      { userId: 'tainá@pipo', role: 'member', companies: 1, open: 2 },
      { userId: 'carla@pipo', role: 'member', companies: 2, open: 1 },
    ])
  })
})
