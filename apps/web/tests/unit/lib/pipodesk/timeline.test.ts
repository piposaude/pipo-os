// @vitest-environment node
import type { components } from '@pipo-os/api-client'
import { commentBodyOf, timelineFromApi } from '@/lib/pipodesk/timeline'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'

const row = (overrides: Partial<TicketRow> & Pick<TicketRow, 'id'>): TicketRow => ({
  displayNumber: null,
  enrollmentId: 'e',
  companyId: 'a',
  status: 'carrier-processing',
  display: 'carrier-processing',
  reason: null,
  subject: 's',
  beneficiaryName: 'Renata Junqueira',
  taxId: null,
  companyName: 'Caiçara Metalurgia',
  parentCompanyId: null,
  parentCompanyName: null,
  companyTaxId: null,
  companySize: null,
  carrierId: null,
  carrierName: 'SulAmérica',
  product: 'health',
  enrollmentType: 'inclusion',
  contractType: 'clt',
  relationship: 'holder',
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
})

const resolveName = (id: string) => (id === 'ana@pipo' ? 'Ana Beatriz' : id)

type TimelineItem = components['schemas']['TimelineItem']

const base = {
  ticketId: '1',
  authorId: 'ana@pipo',
  authorType: 'user' as const,
  createdAt: '2026-08-21T10:00:00.000Z',
}

describe('timelineFromApi', () => {
  it('should open with the creation, naming where the ticket came from', () => {
    const [criacao] = timelineFromApi(row({ id: '1' }), [], resolveName)

    expect(criacao.at).toBe('2026-08-20T10:00:00.000Z')
    expect(criacao.body).toContain('Inclusão')
    expect(criacao.actor).toBe('Sistema')
  })

  it('should keep the API order after the creation', () => {
    const items: TimelineItem[] = [
      { ...base, id: 'a', type: 'comment', channel: 'internal', visibility: 'private', body: '1º' },
      {
        ...base,
        id: 'b',
        type: 'comment',
        channel: 'internal',
        visibility: 'private',
        body: '2º',
        createdAt: '2026-08-22T10:00:00.000Z',
      },
    ]

    expect(timelineFromApi(row({ id: '1' }), items, resolveName).map((e) => e.body)).toEqual([
      expect.stringContaining('Chamado criado'),
      '1º',
      '2º',
    ])
  })

  it('should name the author of a comment, and read the channel off visibility and channel', () => {
    const items: TimelineItem[] = [
      { ...base, id: 'a', type: 'comment', channel: 'internal', visibility: 'private', body: 'x' },
      { ...base, id: 'b', type: 'comment', channel: 'internal', visibility: 'public', body: 'y' },
      { ...base, id: 'c', type: 'comment', channel: 'email', visibility: 'private', body: 'z' },
    ]

    const [, internal, pub, email] = timelineFromApi(row({ id: '1' }), items, resolveName)

    expect(internal).toMatchObject({ actor: 'Ana Beatriz', channel: 'internal' })
    expect(pub.channel).toBe('public')
    expect(email.channel).toBe('email')
  })

  it('should credit the automation, not a person, for what a service or the system wrote', () => {
    const items: TimelineItem[] = [
      {
        ...base,
        id: 'a',
        authorId: 'svc:enrollment-integrations',
        authorType: 'service',
        type: 'event',
        eventType: 'hr_platform_reply',
        body: 'Resposta do RH',
        metadata: {},
      },
    ]

    expect(timelineFromApi(row({ id: '1' }), items, resolveName)[1].actor).toBe('Sistema')
  })

  it('should say who the ticket went to on an assignment', () => {
    const items: TimelineItem[] = [
      {
        ...base,
        id: 'a',
        type: 'event',
        eventType: 'assigned',
        body: 'Responsável alterado',
        metadata: { assigneeId: 'ana@pipo', previous: null },
      },
    ]

    expect(timelineFromApi(row({ id: '1' }), items, resolveName)[1].body).toBe(
      'Responsável alterado: Ana Beatriz',
    )
  })

  it('should say the new priority on a priority change', () => {
    const items: TimelineItem[] = [
      {
        ...base,
        id: 'a',
        type: 'event',
        eventType: 'priority_changed',
        body: 'Prioridade alterada',
        metadata: { priority: 'urgent', previous: null },
      },
    ]

    expect(timelineFromApi(row({ id: '1' }), items, resolveName)[1].body).toBe(
      'Prioridade alterada: Urgente',
    )
  })

  it('should tell a status change in the words of the screen, reason included', () => {
    const items: TimelineItem[] = [
      {
        ...base,
        id: 'a',
        type: 'status-changed',
        fromStatus: 'broker-processing',
        toStatus: 'missing-documents',
        reason: null,
      },
    ]

    const change = timelineFromApi(row({ id: '1' }), items, resolveName)[1]

    expect(change.body).toMatch(/^Situação mudou de .+ para .+\.$/)
    expect(change.body).toContain('Falta documento')
  })

  it('should keep the raw status when this version does not know it', () => {
    const items: TimelineItem[] = [
      {
        ...base,
        id: 'a',
        type: 'status-changed',
        fromStatus: 'broker-processing',
        toStatus: 'status-novo',
        reason: null,
      },
    ]

    expect(timelineFromApi(row({ id: '1' }), items, resolveName)[1].body).toContain('status-novo')
  })

  it('should skip an item type this version does not know, instead of breaking the page', () => {
    const items = [
      { ...base, id: 'a', type: 'comment', channel: 'internal', visibility: 'private', body: '1º' },
      { ...base, id: 'b', type: 'attachment-added' },
    ] as unknown as TimelineItem[]

    expect(timelineFromApi(row({ id: '1' }), items, resolveName).map((e) => e.id)).toEqual([
      '1-created',
      'a',
    ])
  })
})

describe('commentBodyOf', () => {
  it('should write an internal note as private and a public comment as public', () => {
    expect(commentBodyOf('internal', 'x')).toEqual({
      kind: 'manual',
      visibility: 'private',
      body: 'x',
    })
    expect(commentBodyOf('public', 'y')).toEqual({
      kind: 'manual',
      visibility: 'public',
      body: 'y',
    })
  })
})
