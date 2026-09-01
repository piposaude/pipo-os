// @vitest-environment node
import { timelineOf, type TicketComment } from '@/lib/pipodesk/timeline'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'

const row = (overrides: Partial<TicketRow> & Pick<TicketRow, 'id'>): TicketRow =>
  ({
    enrollmentId: 'e',
    companyId: 'a',
    status: 'carrier-processing',
    display: 'carrier-processing',
    reason: null,
    subject: 's',
    beneficiaryName: 'Renata Junqueira',
    taxId: null,
    companyName: 'Caiçara Metalurgia',
    porte: null,
    carrierId: null,
    carrierName: 'SulAmérica',
    product: 'health',
    enrollmentType: 'inclusion',
    contractType: 'clt',
    vinculo: 'titular',
    assigneeId: 'ana@pipo',
    groupId: 'pod-1',
    priority: null,
    actionDate: null,
    tags: [],
    sourceSystem: 'enrollment-integrations',
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-24T15:00:00.000Z',
    closedAt: null,
    ...overrides,
  }) as TicketRow

const resolveName = (id: string) => (id === 'ana@pipo' ? 'Ana Beatriz' : id)

describe('timelineOf', () => {
  it('should open with the creation, naming where the ticket came from', () => {
    const [criacao] = timelineOf(row({ id: '1' }), [], resolveName)

    expect(criacao.at).toBe('2026-08-20T10:00:00.000Z')
    expect(criacao.body).toContain('Inclusão')
    expect(criacao.actor).toBe('Sistema')
  })

  it('should tell who carries the ticket, by name', () => {
    const events = timelineOf(row({ id: '1' }), [], resolveName)

    expect(events.some((event) => event.body.includes('Ana Beatriz'))).toBe(true)
  })

  it('should skip the assignment line when the ticket is free', () => {
    const events = timelineOf(row({ id: '1', assigneeId: null }), [], resolveName)

    expect(events.some((event) => event.body.includes('Atribuído'))).toBe(false)
  })

  it('should append the session comments in order, with their channel', () => {
    const comments: TicketComment[] = [
      {
        id: 'c1',
        ticketId: '1',
        channel: 'internal',
        body: 'Liguei na operadora.',
        at: '2026-08-31T10:00:00.000Z',
        author: 'ana@pipo',
      },
    ]

    const events = timelineOf(row({ id: '1' }), comments, resolveName)
    const last = events[events.length - 1]

    expect(last.body).toBe('Liguei na operadora.')
    expect(last.channel).toBe('internal')
    expect(last.actor).toBe('Ana Beatriz')
  })

  it('should only include the comments of this ticket', () => {
    const comments: TicketComment[] = [
      {
        id: 'c1',
        ticketId: 'outro',
        channel: 'internal',
        body: 'x',
        at: '2026-08-31T10:00:00.000Z',
        author: 'ana@pipo',
      },
    ]

    const events = timelineOf(row({ id: '1' }), comments, resolveName)

    expect(events.some((event) => event.body === 'x')).toBe(false)
  })
})
