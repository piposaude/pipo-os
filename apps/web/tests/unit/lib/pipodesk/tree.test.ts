// @vitest-environment node
import {
  buildTree,
  pillsOf,
  FUTURE_NODE_ID,
  TRIAGE_NODE_ID,
  type TreeNode,
} from '@/lib/pipodesk/tree'
import { applyFilter, windowOf } from '@/lib/pipodesk/filter'
import type { StructureState } from '@/lib/pipodesk/structure'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'

const TODAY = '2026-08-31'
const VIEWER = 'ana@piposaude.com.br'

const row = (overrides: Partial<TicketRow> & Pick<TicketRow, 'id'>): TicketRow => ({
  displayNumber: null,
  enrollmentId: `enr-${overrides.id}`,
  companyId: 'empresa-a',
  status: 'broker-processing',
  display: 'broker-processing',
  reason: null,
  subject: 'Assunto',
  beneficiaryName: null,
  taxId: null,
  companyName: null,
  companySize: null,
  carrierId: null,
  carrierName: null,
  product: 'health',
  enrollmentType: 'inclusion',
  contractType: 'clt',
  relationship: 'holder',
  assigneeId: null,
  groupId: 'pod-1',
  priority: null,
  actionDate: null,
  tags: [],
  sourceSystem: 'enrollment-integrations',
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
  closedAt: null,
  ...overrides,
})

const structure = (overrides: Partial<StructureState> = {}): StructureState => ({
  groups: [
    { id: 'geben', name: 'GEBEN', parentId: null, companyIds: [] },
    { id: 'pod-1', name: 'POD 1', parentId: 'geben', companyIds: ['empresa-a'] },
    { id: 'pod-2', name: 'POD 2', parentId: 'geben', companyIds: ['empresa-b'] },
  ],
  memberships: [
    { userId: VIEWER, groupId: 'pod-1', role: 'member' },
    { userId: 'bia@piposaude.com.br', groupId: 'pod-1', role: 'member' },
  ],
  queues: [],
  ...overrides,
})

const build = (rows: TicketRow[], state = structure(), extra = {}) =>
  buildTree(rows, {
    viewerId: VIEWER,
    viewerGroupId: 'pod-1',
    structure: state,
    today: TODAY,
    ...extra,
  })

const flatten = (nodes: TreeNode[]): TreeNode[] =>
  nodes.flatMap((node) => [node, ...flatten(node.children)])

const nodeById = (sections: ReturnType<typeof build>, id: string): TreeNode | undefined =>
  sections.flatMap((section) => flatten(section.nodes)).find((node) => node.id === id)

describe('buildTree — as três seções', () => {
  it('should return Workspace, Favoritos and Grupos, in that order', () => {
    expect(build([]).map((section) => section.title)).toEqual(['Workspace', 'Favoritos', 'Grupos'])
  })

  it('should put Inbox and Meus tickets in Workspace, with the five recortes below', () => {
    const [workspace] = build([])

    expect(workspace.nodes.map((node) => node.id)).toEqual(['node-inbox', 'node-meus-tickets'])
    expect(workspace.nodes[1].children.map((node) => node.label)).toEqual([
      'Urgentes',
      'Novos',
      'Em espera',
      'Cancelamentos',
      'Concluídos',
    ])
  })
})

describe('buildTree — contagens', () => {
  it('should count in Meus tickets only what is assigned to the viewer', () => {
    const sections = build([
      row({ id: '1', assigneeId: VIEWER }),
      row({ id: '2', assigneeId: 'bia@piposaude.com.br' }),
      row({ id: '3', assigneeId: null }),
    ])

    expect(nodeById(sections, 'node-meus-tickets')?.count).toBe(1)
  })

  it('should count as urgent what is marked urgent or past its action date', () => {
    const sections = build([
      row({ id: '1', assigneeId: VIEWER, priority: 'urgent' }),
      row({ id: '2', assigneeId: VIEWER, actionDate: '2026-08-25' }),
      row({ id: '3', assigneeId: VIEWER, actionDate: TODAY }),
      row({ id: '4', assigneeId: VIEWER }),
    ])

    expect(nodeById(sections, 'node-urgentes')?.count).toBe(3)
  })

  it('should treat "Em espera" as waiting on the carrier or on the client', () => {
    const sections = build([
      row({ id: '1', assigneeId: VIEWER, status: 'carrier-processing' }),
      row({ id: '2', assigneeId: VIEWER, status: 'missing-documents' }),
      row({ id: '3', assigneeId: VIEWER, status: 'incorrect-data' }),
      row({ id: '4', assigneeId: VIEWER, status: 'broker-processing' }),
    ])

    expect(nodeById(sections, 'node-em-espera')?.count).toBe(3)
  })

  it('should count the closed ones even though they left the awake window', () => {
    const sections = build([
      row({
        id: '1',
        assigneeId: VIEWER,
        status: 'completed',
        closedAt: '2026-08-28T10:00:00.000Z',
      }),
      row({ id: '2', assigneeId: VIEWER }),
    ])

    expect(nodeById(sections, 'node-concluidos')?.count).toBe(1)
    // ...and the closed one does not inflate the parent, which counts awake only.
    expect(nodeById(sections, 'node-meus-tickets')?.count).toBe(1)
  })

  it('should count the sleeping tickets in Movimentações futuras, and nowhere else', () => {
    const sections = build([row({ id: '1', actionDate: '2026-09-30' }), row({ id: '2' })])

    expect(nodeById(sections, FUTURE_NODE_ID)?.count).toBe(1)
    expect(nodeById(sections, 'node-geben')?.count).toBe(1)
  })
})

describe('buildTree — Triagem', () => {
  it('should not draw the node when every company has a pod', () => {
    const sections = build([row({ id: '1', companyId: 'empresa-a' })])

    expect(nodeById(sections, TRIAGE_NODE_ID)).toBeUndefined()
  })

  it('should draw it for the tickets of a company no pod carries, still in the root group', () => {
    const sections = build([
      row({ id: '1', companyId: 'empresa-nova', groupId: 'geben' }),
      row({ id: '2', companyId: 'empresa-nova', groupId: 'pod-1' }),
      row({ id: '3', companyId: 'empresa-a', groupId: 'geben' }),
    ])

    // Only the first: no portfolio AND still in the root. Without the group
    // clause, moving the ticket would not clear the row.
    expect(nodeById(sections, TRIAGE_NODE_ID)?.count).toBe(1)
  })
})

describe('buildTree — pods', () => {
  it('should put the viewer pod first', () => {
    const sections = build([], structure())
    const geben = nodeById(sections, 'node-geben')

    expect(
      geben?.children.filter((node) => node.id.startsWith('node-pod')).map((n) => n.label),
    ).toEqual(['POD 1', 'POD 2'])
  })

  it('should give each pod Chamados and Livres', () => {
    const sections = build([
      row({ id: '1', groupId: 'pod-1', assigneeId: VIEWER }),
      row({ id: '2', groupId: 'pod-1', assigneeId: null }),
    ])

    expect(nodeById(sections, 'node-pod-1-chamados')?.count).toBe(2)
    expect(nodeById(sections, 'node-pod-1-livres')?.count).toBe(1)
  })

  it('should hang the analysts under a saved MOV queue, counting only their share', () => {
    const state = structure({
      queues: [
        {
          id: 'queue-pod-1-clt',
          name: 'MOV CLT',
          groupId: 'pod-1',
          ownerId: null,
          subscriberIds: [],
          filter: { contractTypes: ['clt'] },
          sort: { by: 'actionDate', direction: 'asc' },
        },
      ],
    })
    const sections = build(
      [
        row({ id: '1', assigneeId: VIEWER, contractType: 'clt' }),
        row({ id: '2', assigneeId: VIEWER, contractType: 'pj' }),
        row({ id: '3', assigneeId: 'bia@piposaude.com.br', contractType: 'clt' }),
      ],
      state,
    )

    const clt = nodeById(sections, 'queue-pod-1-clt')
    expect(clt?.count).toBe(2)
    expect(clt?.children.map((child) => child.count)).toEqual([1, 1])
  })
})

describe('buildTree — Favoritos', () => {
  const withQueue = (subscriberIds: string[]) =>
    structure({
      queues: [
        {
          id: 'queue-pod-1-clt',
          name: 'MOV CLT',
          groupId: 'pod-1',
          ownerId: null,
          subscriberIds,
          filter: { contractTypes: ['clt'] },
          sort: { by: 'actionDate', direction: 'asc' },
        },
      ],
    })

  it('should open empty until someone stars a view', () => {
    const [, favorites] = build([], withQueue([]))

    expect(favorites.nodes).toEqual([])
  })

  it('should copy the source node, prefixing the id so both entries stay addressable', () => {
    const sections = build([row({ id: '1', contractType: 'clt' })], withQueue([VIEWER]))
    const [, favorites] = sections

    expect(favorites.nodes).toHaveLength(1)
    expect(favorites.nodes[0].id).toBe('fav-queue-pod-1-clt')
    expect(favorites.nodes[0].count).toBe(nodeById(sections, 'queue-pod-1-clt')?.count)
    expect(favorites.nodes[0].depth).toBe(0)
    expect(favorites.nodes[0].children).toEqual([])
  })
})

describe('buildTree — o invariante: contagem do nó = lista que a tela monta', () => {
  it('should hold for every node of the tree', () => {
    const rows = [
      row({ id: '1', assigneeId: VIEWER, priority: 'urgent' }),
      row({ id: '2', assigneeId: VIEWER, status: 'carrier-processing' }),
      row({ id: '3', assigneeId: 'bia@piposaude.com.br', contractType: 'pj' }),
      row({ id: '4', assigneeId: null, groupId: 'pod-2', companyId: 'empresa-b' }),
      row({ id: '5', actionDate: '2026-09-30' }),
      row({
        id: '6',
        status: 'completed',
        closedAt: '2026-08-29T10:00:00.000Z',
        assigneeId: VIEWER,
      }),
      row({ id: '7', companyId: 'empresa-nova', groupId: 'geben' }),
      row({ id: '8', createdAt: `${TODAY}T09:00:00.000Z`, assigneeId: VIEWER }),
    ]
    const sections = build(rows)

    for (const node of sections.flatMap((section) => flatten(section.nodes))) {
      // The screen cuts by node scope and window, then filters. Counting any
      // other way is how the invariant broke twice in the prototype.
      const scoped =
        node.groupId === null ? rows : rows.filter((ticket) => ticket.groupId === node.groupId)
      const listed = applyFilter(windowOf(scoped, node.windowMode, TODAY), node.filter, VIEWER)

      expect(`${node.id}: ${node.count}`).toBe(`${node.id}: ${listed.length}`)
    }
  })

  it('should hold for MOV PJ, which is services-contract only (filter [pj])', () => {
    const state = structure({
      queues: [
        {
          id: 'queue-pod-1-pj',
          name: 'MOV PJ',
          groupId: 'pod-1',
          ownerId: null,
          subscriberIds: [],
          filter: { contractTypes: ['pj'] },
          sort: { by: 'actionDate', direction: 'asc' },
        },
      ],
    })
    const rows = [
      row({ id: '1', contractType: 'pj' }),
      row({ id: '2', contractType: null }),
      row({ id: '3', contractType: 'clt' }),
    ]
    const sections = build(rows, state)
    const pj = nodeById(sections, 'queue-pod-1-pj')

    expect(pj?.count).toBe(1)
    const listed = applyFilter(windowOf(rows, pj!.windowMode, TODAY), pj!.filter, VIEWER)
    expect(listed.map((ticket) => ticket.id)).toEqual(['1'])
  })
})

describe('buildTree — rótulo de exibição', () => {
  /** The root group's real name stays; the tree exposes GEBEN — the everyday
   *  name, and the breadcrumb follows the short form for free. */
  it('should display the root group by its everyday short name', () => {
    const comNomeReal = structure({
      groups: [
        { id: 'group-geben', name: 'Gestão de Benefícios', parentId: null, companyIds: [] },
        { id: 'pod-1', name: 'POD 1', parentId: 'group-geben', companyIds: ['a'] },
      ],
    })
    const sections = build([], comNomeReal)

    expect(nodeById(sections, 'node-group-geben')?.label).toBe('GEBEN')
  })

  it('should leave any other root name alone', () => {
    const sections = build([])

    expect(nodeById(sections, 'node-geben')?.label).toBe('GEBEN')
  })
})

describe('buildTree — caminho', () => {
  it('should stitch the label path from the root down, for the breadcrumb', () => {
    const sections = build([])

    expect(nodeById(sections, 'node-novos')?.path).toEqual(['Meus tickets', 'Novos'])
    expect(nodeById(sections, 'node-pod-1-livres')?.path).toEqual(['GEBEN', 'POD 1', 'Livres'])
  })
})

describe('pillsOf', () => {
  it('should return the children when the node has them', () => {
    const sections = build([])

    expect(pillsOf(sections, 'node-meus-tickets').map((node) => node.label)).toEqual([
      'Urgentes',
      'Novos',
      'Em espera',
      'Cancelamentos',
      'Concluídos',
    ])
  })

  it('should return the siblings when the node is a leaf', () => {
    const sections = build([])

    expect(pillsOf(sections, 'node-novos').map((node) => node.label)).toEqual([
      'Urgentes',
      'Novos',
      'Em espera',
      'Cancelamentos',
      'Concluídos',
    ])
  })

  it('should return nothing for a childless top-level node, instead of its section', () => {
    expect(pillsOf(build([]), 'node-inbox')).toEqual([])
  })
})
