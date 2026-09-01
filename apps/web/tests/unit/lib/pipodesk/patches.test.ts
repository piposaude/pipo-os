// @vitest-environment node
import { applyPatches, type TicketPatch } from '@/lib/pipodesk/patches'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'

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
    porte: null,
    carrierId: null,
    carrierName: null,
    product: null,
    enrollmentType: 'inclusion',
    contractType: 'clt',
    vinculo: 'titular',
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

const TODAY = '2026-08-31'

describe('applyPatches', () => {
  it('should ignore an explicit undefined in the patch — absence is the only "keep"', () => {
    const base = [row({ id: '1', priority: 'urgent' })]
    const patched = applyPatches(base, { '1': { priority: undefined } }, TODAY)

    expect(patched[0].priority).toBe('urgent')
  })

  it('should leave the base untouched and return it unchanged when there is no patch', () => {
    const base = [row({ id: '1' })]

    expect(applyPatches(base, {}, TODAY)).toBe(base)
  })

  it('should apply assignee and priority, keeping null as a value and not as absence', () => {
    const base = [row({ id: '1', assigneeId: 'ana@pipo', priority: 'urgent' })]
    const patches: Record<string, TicketPatch> = { '1': { assigneeId: null, priority: null } }

    const [patched] = applyPatches(base, patches, TODAY)

    expect(patched.assigneeId).toBeNull()
    expect(patched.priority).toBeNull()
  })

  /** The API status drags its derived fields: a row must never show one
   *  status with another state's display. */
  it('should recompute display, reason and closedAt when the status changes', () => {
    const base = [row({ id: '1' })]

    const [pendente] = applyPatches(base, { '1': { status: 'missing-documents' } }, TODAY)
    expect(pendente.display).toBe('client-pending')
    expect(pendente.reason).toBe('missing-documents')
    expect(pendente.closedAt).toBeNull()

    const [fechado] = applyPatches(base, { '1': { status: 'completed' } }, TODAY)
    expect(fechado.display).toBe('completed')
    expect(fechado.closedAt).not.toBeNull()
  })

  it('should reopen a closed ticket when the status goes back to an open one', () => {
    const base = [
      row({
        id: '1',
        status: 'completed',
        display: 'completed',
        reason: null,
        closedAt: '2026-08-20T10:00:00.000Z',
      }),
    ]

    const [reaberto] = applyPatches(base, { '1': { status: 'broker-open-issue' } }, TODAY)

    expect(reaberto.closedAt).toBeNull()
    expect(reaberto.reason).toBe('internal-issue')
  })

  it('should move the ticket to another pod, clearing the owner that stayed behind', () => {
    const base = [row({ id: '1', assigneeId: 'ana@pipo' })]

    const [movido] = applyPatches(base, { '1': { groupId: 'pod-2', assigneeId: null } }, TODAY)

    expect(movido.groupId).toBe('pod-2')
    expect(movido.assigneeId).toBeNull()
  })
})
