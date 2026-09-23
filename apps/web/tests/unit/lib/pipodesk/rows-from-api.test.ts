import { describe, expect, it } from 'vitest'
import { rowsFromApi, type ApiTicketRow } from '@/lib/pipodesk/rows-from-api'

const apiRow = (overrides: Partial<ApiTicketRow> = {}): ApiTicketRow => ({
  id: 't-1',
  displayNumber: '41',
  enrollmentId: 'enr-1',
  companyId: 'c-1',
  status: 'carrier-processing',
  title: null,
  beneficiaryName: 'Ana Souza',
  taxId: null,
  companyName: 'Empresa A',
  parentCompanyId: null,
  parentCompanyName: null,
  companyTaxId: null,
  companySize: null,
  carrierId: 'amil',
  carrierName: 'Amil',
  product: 'health',
  enrollmentType: 'inclusion',
  contractType: 'clt',
  relationship: 'holder',
  assigneeId: 'ana@piposaude.com.br',
  groupId: 'g-1',
  priority: null,
  actionDate: null,
  tags: [],
  sourceSystem: 'enrollment-integrations',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  closedAt: null,
  ...overrides,
})

describe('rowsFromApi', () => {
  it('should derivar o estado visível e o motivo a partir do status da API', () => {
    const [row] = rowsFromApi([apiRow({ status: 'missing-documents' })])

    expect(row.status).toBe('missing-documents')
    expect(row.display).toBe('client-pending')
    expect(row.reason).toBe('missing-documents')
  })

  it('should trazer a data de ação como dia de São Paulo, que é como a fila compara', () => {
    const [row] = rowsFromApi([apiRow({ actionDate: '2026-09-23T01:30:00.000Z' })])

    // 01:30 UTC ainda é dia 22 em São Paulo, e a fila compara strings de dia.
    expect(row.actionDate).toBe('2026-09-22')
  })

  it('should deixar a data de ação nula como nula', () => {
    expect(rowsFromApi([apiRow({ actionDate: null })])[0].actionDate).toBeNull()
  })

  it('should deixar o chamado sem pod com groupId nulo, que é o que a contagem dos pods ignora', () => {
    expect(rowsFromApi([apiRow({ groupId: null })])[0].groupId).toBeNull()
  })

  it('should montar o assunto quando o chamado não tem título escrito', () => {
    const [row] = rowsFromApi([apiRow({ title: null })])

    expect(row.subject).toBe('Amil · health · Ana Souza')
  })

  it('should preferir o título escrito ao assunto derivado', () => {
    const [row] = rowsFromApi([apiRow({ title: 'Inclusão urgente' })])

    expect(row.subject).toBe('Inclusão urgente')
  })

  it('should manter o chamado sem prioridade quando ela está fora do vocabulário desta versão', () => {
    const rows = rowsFromApi([
      apiRow({ id: 'conhecido', priority: 'urgent' }),
      apiRow({ id: 'novo-nivel', priority: 'critical' }),
    ])

    expect(rows.map((row) => [row.id, row.priority])).toEqual([
      ['conhecido', 'urgent'],
      ['novo-nivel', null],
    ])
  })

  it('should deixar passar a linha cujo status esta versão não conhece, sem derrubar a fila', () => {
    const rows = rowsFromApi([apiRow({ id: 'bom' }), apiRow({ id: 'ruim', status: 'inventado' })])

    expect(rows.map((row) => row.id)).toEqual(['bom'])
  })
})
