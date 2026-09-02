// @vitest-environment node
import { tallyPods } from '@/lib/pipodesk/tally'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'

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
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  closedAt: null,
  ...overrides,
})

describe('tallyPods', () => {
  it('should count the pod total and split it by contract type', () => {
    const tally = tallyPods([
      row({ id: '1', contractType: 'clt' }),
      row({ id: '2', contractType: 'pj' }),
      row({ id: '3', contractType: 'clt' }),
    ])

    expect(tally.get('pod-1')).toMatchObject({ total: 3, clt: 2, pj: 1 })
  })

  it('should count a multi-benefit ticket in MB and in its contract type, because MB crosses the axis', () => {
    const tally = tallyPods([row({ id: '1', product: 'gym', contractType: 'pj' })])

    expect(tally.get('pod-1')).toMatchObject({ total: 1, clt: 0, pj: 1, mb: 1 })
  })

  it('should treat an unknown contract type as PJ, the way the prototype does', () => {
    const tally = tallyPods([row({ id: '1', contractType: null })])

    expect(tally.get('pod-1')).toMatchObject({ clt: 0, pj: 1 })
  })

  it('should break the pod down by assignee, leaving the unassigned out', () => {
    const tally = tallyPods([
      row({ id: '1', assigneeId: 'ana@pipo', contractType: 'clt' }),
      row({ id: '2', assigneeId: 'ana@pipo', product: 'pet', contractType: 'pj' }),
      row({ id: '3', assigneeId: null }),
    ])

    const pod = tally.get('pod-1')
    expect(pod?.total).toBe(3)
    expect(pod?.byAssignee.get('ana@pipo')).toEqual({ clt: 1, pj: 1, mb: 1 })
    expect(pod?.byAssignee.size).toBe(1)
  })

  it('should ignore a ticket with no pod — it belongs to triage, not to a pod', () => {
    const tally = tallyPods([row({ id: '1', groupId: null })])

    expect(tally.size).toBe(0)
  })

  it('should keep one entry per pod', () => {
    const tally = tallyPods([row({ id: '1' }), row({ id: '2', groupId: 'pod-2' })])

    expect([...tally.keys()].sort()).toEqual(['pod-1', 'pod-2'])
  })
})
