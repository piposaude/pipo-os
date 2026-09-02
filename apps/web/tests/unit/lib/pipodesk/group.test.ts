// @vitest-environment node
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import { groupTickets } from '@/lib/pipodesk/group'
import { NULL_TOKEN } from '@/lib/pipodesk/filter'

function row(overrides: Partial<TicketRow> & { id: string }): TicketRow {
  return {
    displayNumber: null,
    enrollmentId: 'e',
    companyId: 'company-1',
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

describe('groupTickets', () => {
  it('should return a single unnamed group when grouping is off', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })]
    const groups = groupTickets(rows, 'none')

    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('')
    expect(groups[0].tickets.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('should group by status using the canonical order and the operation copy', () => {
    const rows = [
      row({ id: 'cancelada', status: 'cancelled', display: 'cancelled' }),
      row({ id: 'pipo', status: 'broker-processing', display: 'broker-processing' }),
      row({ id: 'cliente', status: 'missing-documents', display: 'client-pending' }),
    ]

    const groups = groupTickets(rows, 'status')

    expect(groups.map((g) => g.key)).toEqual(['broker-processing', 'client-pending', 'cancelled'])
    expect(groups.map((g) => g.label)).toEqual(['Com a Pipo', 'Com o cliente', 'Cancelada'])
  })

  it('should put the two client statuses in the same group, because the interface shows one', () => {
    const rows = [
      row({ id: 'doc', status: 'missing-documents', display: 'client-pending' }),
      row({ id: 'dado', status: 'incorrect-data', display: 'client-pending' }),
    ]

    const groups = groupTickets(rows, 'status')

    expect(groups).toHaveLength(1)
    expect(groups[0].tickets.map((t) => t.id)).toEqual(['doc', 'dado'])
  })

  it('should group by company, falling back to the id when the snapshot has no name', () => {
    const rows = [
      row({ id: 'a', companyId: 'c-1', companyName: 'Caiçara Metalurgia' }),
      row({ id: 'b', companyId: 'c-2', companyName: null }),
      row({ id: 'c', companyId: 'c-1', companyName: 'Caiçara Metalurgia' }),
    ]

    const groups = groupTickets(rows, 'company')

    expect(groups.map((g) => g.label)).toEqual(['Caiçara Metalurgia', 'c-2'])
    expect(groups[0].tickets.map((t) => t.id)).toEqual(['a', 'c'])
  })

  it('should group by product with pt-BR copy and a named group for the ones without it', () => {
    const rows = [row({ id: 'a', product: 'life' }), row({ id: 'b', product: null })]

    const groups = groupTickets(rows, 'product')

    expect(groups.map((g) => g.label)).toEqual(['Vida', 'Sem produto'])
  })

  it('should group by assignee, naming the unassigned group after the pod', () => {
    const rows = [
      row({ id: 'a', assigneeId: 'ana.souza@pipo.health' }),
      row({ id: 'b', assigneeId: null }),
    ]

    const groups = groupTickets(rows, 'assignee')

    expect(groups.map((g) => g.key)).toEqual(['ana.souza@pipo.health', NULL_TOKEN])
    expect(groups[1].label).toBe('Livre no pod')
  })

  it('should use a name resolver for the assignee label when one is given', () => {
    const rows = [row({ id: 'a', assigneeId: 'ana.souza@pipo.health' })]

    const groups = groupTickets(rows, 'assignee', (id) =>
      id === 'ana.souza@pipo.health' ? 'Ana Souza' : id,
    )

    expect(groups[0].label).toBe('Ana Souza')
  })

  it('should preserve the incoming order inside each group, because grouping does not reorder', () => {
    const rows = [
      row({ id: 'primeiro', product: 'life' }),
      row({ id: 'outro', product: 'health' }),
      row({ id: 'segundo', product: 'life' }),
    ]

    const groups = groupTickets(rows, 'product')

    expect(groups[0].tickets.map((t) => t.id)).toEqual(['primeiro', 'segundo'])
  })

  /** Same reason as the filter token: a key that is a plain word shares the
   *  space with real data, so an analyst named `livre` would land in the
   *  "Livre no pod" group. */
  it('should not put a real assignee in the no-owner group because of its name', () => {
    const groups = groupTickets(
      [row({ id: 'a', assigneeId: null }), row({ id: 'b', assigneeId: 'livre' })],
      'assignee',
      (id) => id,
    )

    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.label === 'Livre no pod')?.tickets).toHaveLength(1)
  })
})
