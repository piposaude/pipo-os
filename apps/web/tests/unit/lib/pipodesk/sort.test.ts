// @vitest-environment node
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import { DEFAULT_SORT, TRIAGE_RANK, sortTickets } from '@/lib/pipodesk/sort'

function row(overrides: Partial<TicketRow> & { id: string }): TicketRow {
  return {
    enrollmentId: 'e',
    companyId: 'c',
    status: 'broker-processing',
    display: 'broker-processing',
    reason: null,
    subject: 's',
    beneficiaryName: null,
    taxId: null,
    companyName: null,
    porte: null,
    carrierId: null,
    carrierName: null,
    product: null,
    enrollmentType: 'inclusion',
    contractType: null,
    vinculo: null,
    assigneeId: null,
    groupId: null,
    priority: null,
    actionDate: null,
    tags: [],
    sourceSystem: 'ei',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    closedAt: null,
    ...overrides,
  }
}

const ids = (rows: TicketRow[]): string[] => rows.map((r) => r.id)

describe('sortTickets by actionDate', () => {
  it('should be the default sort, ascending', () => {
    expect(DEFAULT_SORT).toEqual({ by: 'actionDate', direction: 'asc' })
  })

  it('should order real dates ascending', () => {
    const rows = [
      row({ id: 'c', actionDate: '2026-09-03' }),
      row({ id: 'a', actionDate: '2026-09-01' }),
      row({ id: 'b', actionDate: '2026-09-02' }),
    ]

    expect(ids(sortTickets(rows, { by: 'actionDate', direction: 'asc' }))).toEqual(['a', 'b', 'c'])
  })

  it('should keep tickets without an action date at the end in BOTH directions', () => {
    const rows = [
      row({ id: 'sem-data', actionDate: null }),
      row({ id: 'depois', actionDate: '2026-09-02' }),
      row({ id: 'antes', actionDate: '2026-09-01' }),
    ]

    expect(ids(sortTickets(rows, { by: 'actionDate', direction: 'asc' }))).toEqual([
      'antes',
      'depois',
      'sem-data',
    ])
    expect(ids(sortTickets(rows, { by: 'actionDate', direction: 'desc' }))).toEqual([
      'depois',
      'antes',
      'sem-data',
    ])
  })

  it('should order tickets without an action date by updatedAt ascending, the most forgotten first', () => {
    const rows = [
      row({ id: 'recente', actionDate: null, updatedAt: '2026-08-20T00:00:00.000Z' }),
      row({ id: 'esquecido', actionDate: null, updatedAt: '2026-07-01T00:00:00.000Z' }),
    ]

    expect(ids(sortTickets(rows, { by: 'actionDate', direction: 'asc' }))).toEqual([
      'esquecido',
      'recente',
    ])
    expect(ids(sortTickets(rows, { by: 'actionDate', direction: 'desc' }))).toEqual([
      'esquecido',
      'recente',
    ])
  })
})

describe('sortTickets by other fields', () => {
  it('should invert entirely when the direction inverts', () => {
    const rows = [
      row({ id: 'b', createdAt: '2026-08-02T00:00:00.000Z' }),
      row({ id: 'a', createdAt: '2026-08-01T00:00:00.000Z' }),
    ]

    expect(ids(sortTickets(rows, { by: 'createdAt', direction: 'asc' }))).toEqual(['a', 'b'])
    expect(ids(sortTickets(rows, { by: 'createdAt', direction: 'desc' }))).toEqual(['b', 'a'])
  })

  it('should order companies by name using pt-BR collation', () => {
    const rows = [
      row({ id: 'z', companyName: 'Zebra Ltda' }),
      row({ id: 'a', companyName: 'Ática S.A.' }),
      row({ id: 'c', companyName: 'Caiçara Metalurgia' }),
    ]

    expect(ids(sortTickets(rows, { by: 'company', direction: 'asc' }))).toEqual(['a', 'c', 'z'])
  })

  it('should order by the triage ruler, not by the declaration order of the type', () => {
    const rows = [
      row({ id: 'operadora', status: 'carrier-processing', display: 'carrier-processing' }),
      row({ id: 'cliente', status: 'missing-documents', display: 'client-pending' }),
      row({ id: 'pipo', status: 'broker-processing', display: 'broker-processing' }),
    ]

    expect(ids(sortTickets(rows, { by: 'status', direction: 'asc' }))).toEqual([
      'pipo',
      'cliente',
      'operadora',
    ])
  })

  it('should put the triage ruler in the agreed order', () => {
    expect([...TRIAGE_RANK.keys()]).toEqual([
      'broker-processing',
      'client-pending',
      'carrier-processing',
      'submitted-cancellation',
      'completed',
      'cancelled',
    ])
  })
})

describe('sortTickets stability', () => {
  it('should break ties by id so the order never flickers between renders', () => {
    const rows = [
      row({ id: 'b', actionDate: '2026-09-01' }),
      row({ id: 'a', actionDate: '2026-09-01' }),
    ]

    expect(ids(sortTickets(rows, { by: 'actionDate', direction: 'asc' }))).toEqual(['a', 'b'])
    expect(ids(sortTickets(rows, { by: 'actionDate', direction: 'desc' }))).toEqual(['a', 'b'])
  })

  it('should not mutate the array it receives', () => {
    const rows = [
      row({ id: 'b', actionDate: '2026-09-02' }),
      row({ id: 'a', actionDate: '2026-09-01' }),
    ]
    sortTickets(rows, DEFAULT_SORT)

    expect(ids(rows)).toEqual(['b', 'a'])
  })
})
