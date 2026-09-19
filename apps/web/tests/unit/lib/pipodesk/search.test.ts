// @vitest-environment node
import { searchQueue, defaultHits } from '@/lib/pipodesk/search'
import { buildTree } from '@/lib/pipodesk/tree'
import type { StructureState } from '@/lib/pipodesk/structure'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'

const row = (overrides: Partial<TicketRow> & Pick<TicketRow, 'id'>): TicketRow => ({
  displayNumber: null,
  enrollmentId: 'e',
  companyId: 'empresa-1',
  status: 'broker-processing',
  display: 'broker-processing',
  reason: null,
  subject: 's',
  beneficiaryName: null,
  taxId: null,
  companyName: 'Caiçara Metalurgia',
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
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
  closedAt: null,
  ...overrides,
})

const structure: StructureState = {
  groups: [
    { id: 'geben', name: 'GEBEN', parentId: null, companyIds: [] },
    { id: 'pod-1', name: 'POD 1', parentId: 'geben', companyIds: ['empresa-1'] },
  ],
  memberships: [],
  queues: [],
}

const rows = [
  row({ id: '705639', beneficiaryName: 'Renata Henriques Junqueira' }),
  row({
    id: '704919',
    beneficiaryName: 'Daniel Klein Marinho',
    companyId: 'empresa-2',
    companyName: 'Guaporé Agropecuária',
  }),
  row({
    id: '704988',
    beneficiaryName: 'Renata Borges',
    status: 'completed',
    display: 'completed',
    closedAt: '2026-08-01T10:00:00.000Z',
  }),
  row({ id: '705700', displayNumber: 'M000123' }),
  row({ id: '705701', beneficiaryName: 'Paula Souza' }),
  row({
    id: '705702',
    beneficiaryName: 'Paula Souza',
    companyId: 'empresa-2',
    companyName: 'Guaporé Agropecuária',
  }),
]

const sections = buildTree(rows, {
  viewerId: 'ana@pipo',
  viewerGroupId: 'pod-1',
  structure,
  today: '2026-08-31',
})

describe('searchQueue', () => {
  it('should find a ticket by its number, the thing people paste from Slack', () => {
    const groups = searchQueue('705639', rows, sections)
    const chamados = groups.find((group) => group.category === 'chamado')

    expect(chamados?.hits[0].label).toContain('705639')
    expect(chamados?.hits[0].node.filter).toEqual({ ticketIds: ['705639'] })
  })

  /** Accent- and case-insensitive: requiring accents on Brazilian names is a
   *  broken search. */
  it('should match names ignoring accents and case', () => {
    const groups = searchQueue('guapore', rows, sections)
    const empresas = groups.find((group) => group.category === 'empresa')

    expect(empresas?.hits[0].label).toBe('Guaporé Agropecuária')
    expect(empresas?.hits[0].node.filter).toEqual({ companyIds: ['empresa-2'] })
  })

  /** Search crosses the window: yesterday's closed ticket is exactly what one
   *  looks up by number. */
  it('should group a person under beneficiários, listing every ticket of hers', () => {
    const groups = searchQueue('renata', rows, sections)
    const pessoas = groups.find((group) => group.category === 'beneficiario')

    expect(pessoas?.hits.map((hit) => hit.label)).toEqual([
      'Renata Henriques Junqueira',
      'Renata Borges',
    ])
    expect(pessoas?.hits[0].node.windowMode).toBe('all')
  })

  it('should find a ticket by its display number', () => {
    const groups = searchQueue('m000123', rows, sections)
    const chamados = groups.find((group) => group.category === 'chamado')

    expect(chamados?.hits[0].label).toBe('Chamado M000123')
    expect(chamados?.hits[0].node.filter).toEqual({ ticketIds: ['705700'] })
  })

  it('should keep homonyms from different companies as two results', () => {
    const groups = searchQueue('paula souza', rows, sections)
    const pessoas = groups.find((group) => group.category === 'beneficiario')

    expect(pessoas?.hits).toHaveLength(2)
    expect(pessoas?.hits.map((hit) => hit.detail)).toEqual([
      'Caiçara Metalurgia',
      'Guaporé Agropecuária',
    ])
  })

  it('should find the tree views by label', () => {
    const groups = searchQueue('urgentes', rows, sections)
    const visoes = groups.find((group) => group.category === 'visao')

    expect(visoes?.hits[0].label).toBe('Urgentes')
    expect(visoes?.hits[0].node.id).toBe('node-urgentes')
  })

  it('should return nothing for an empty query', () => {
    expect(searchQueue('   ', rows, sections)).toEqual([])
  })
})

describe('defaultHits', () => {
  it('should teach the shortcut with the views people use most', () => {
    const hits = defaultHits(sections)

    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].label).toBe('Meus tickets')
  })
})

describe('detail da empresa na busca', () => {
  const branch = row({
    id: '1',
    companyId: 'empresa-1',
    companyName: 'Caiçara Metalurgia',
    parentCompanyId: 'empresa-9',
    parentCompanyName: 'Grupo Quiriri',
  })

  it('should name the parent on a branch result', () => {
    const groups = searchQueue('caicara', [branch], sections)

    const empresas = groups.find((group) => group.category === 'empresa')
    expect(empresas?.hits[0].detail).toBe('Filial de Grupo Quiriri')
  })

  it('should call a company with no parent a parent company', () => {
    const groups = searchQueue(
      'caicara',
      [row({ id: '1', companyName: 'Caiçara Metalurgia' })],
      sections,
    )

    const empresas = groups.find((group) => group.category === 'empresa')
    expect(empresas?.hits[0].detail).toBe('Matriz')
  })

  /* The fixture shares a trade name between 116 companies, so two branches of
     the same parent read identically without it. */
  it('should tell two companies apart by the cnpj when it is known', () => {
    const other = row({
      id: '2',
      companyId: 'empresa-2',
      companyName: 'Caiçara Metalurgia',
      parentCompanyId: 'empresa-9',
      parentCompanyName: 'Grupo Quiriri',
    })

    const groups = searchQueue('caicara', [branch, other], sections, {
      'empresa-1': { legalName: 'Caiçara Metalurgia LTDA', cnpj: '11.222.333/0001-44' },
      'empresa-2': { legalName: 'Caiçara Metalurgia ME', cnpj: '11.222.333/0002-25' },
    })

    const details = groups
      .find((group) => group.category === 'empresa')
      ?.hits.map((hit) => hit.detail)
    expect(details).toEqual([
      'Filial de Grupo Quiriri · 11.222.333/0001-44',
      'Filial de Grupo Quiriri · 11.222.333/0002-25',
    ])
  })

  it('should keep the structure alone when the cnpj is unknown', () => {
    const groups = searchQueue('caicara', [branch], sections, {})

    const empresas = groups.find((group) => group.category === 'empresa')
    expect(empresas?.hits[0].detail).toBe('Filial de Grupo Quiriri')
  })
})

describe('empresa na busca: rótulo, casamento e contagem', () => {
  const registry = {
    'empresa-9': { legalName: 'Quiriri Participações S.A.', cnpj: '11.222.333/0001-44' },
    'empresa-1': { legalName: 'Caiçara Metalurgia LTDA', cnpj: '11.222.333/0002-25' },
  }

  const parent = row({ id: '1', companyId: 'empresa-9', companyName: 'Grupo Quiriri' })
  const branchRow = row({
    id: '2',
    companyId: 'empresa-1',
    companyName: 'Caiçara Metalurgia',
    parentCompanyId: 'empresa-9',
    parentCompanyName: 'Grupo Quiriri',
  })

  const empresaHits = (query: string) =>
    searchQueue(query, [parent, branchRow], sections, registry).find(
      (group) => group.category === 'empresa',
    )?.hits

  it('should label the result with the legal name when it is known', () => {
    expect(empresaHits('quiriri')?.[0].label).toBe('Quiriri Participações S.A.')
  })

  it('should find a company by its legal name', () => {
    expect(empresaHits('participações')?.[0].label).toBe('Quiriri Participações S.A.')
  })

  it('should find a company by the digits of its cnpj', () => {
    expect(empresaHits('333/0002')?.[0].label).toBe('Caiçara Metalurgia LTDA')
  })

  /* The node filter matches a company or its parent, so a parent result opens
     the branches too — the count has to say the same number. */
  it('should count the branches under a parent result', () => {
    expect(empresaHits('quiriri')?.[0].count).toBe(2)
  })

  it('should count only itself on a branch result', () => {
    expect(empresaHits('caicara')?.[0].count).toBe(1)
  })
})
