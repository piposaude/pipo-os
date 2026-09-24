import { describe, expect, it } from 'vitest'
import type { TicketCompletion } from '../tickets/schemas.js'
import { statusChangedPayload, type StatusChange } from './payload.js'

const ticket: StatusChange['ticket'] = {
  id: '11111111-1111-4111-8111-111111111111',
  displayNumber: 'M000123',
  enrollmentId: '22222222-2222-4222-8222-222222222222',
  companyId: '33333333-3333-4333-8333-333333333333',
}

const completion: TicketCompletion = {
  members: [{ taxId: '12345678900', idCardNumber: '0001234500018', startDate: '2026-10-01' }],
  endDate: null,
  effectiveDate: null,
  mecsasCompanyCode: 'MX1',
  hasGracePeriod: false,
  carrierTrackingNumber: null,
  documentTypes: null,
}

const change = (overrides: Partial<StatusChange> = {}): StatusChange => ({
  ticket,
  fromStatus: 'carrier-processing',
  toStatus: 'completed',
  reason: 'Operadora confirmou',
  actor: { type: 'user', id: 'analyst@pipo.health' },
  occurredAt: '2026-09-24T18:22:03.114Z',
  completion,
  ...overrides,
})

describe('statusChangedPayload', () => {
  it('writes the v1 body of the contract, with the delivery as its id', () => {
    expect(statusChangedPayload('55555555-5555-4555-8555-555555555555', change())).toEqual({
      delivery_id: '55555555-5555-4555-8555-555555555555',
      event_type: 'ticket.status_changed',
      occurred_at: '2026-09-24T18:22:03.114Z',
      ticket_id: ticket.id,
      display_number: 'M000123',
      enrollment_id: ticket.enrollmentId,
      company_id: ticket.companyId,
      from_status: 'carrier-processing',
      to_status: 'completed',
      reason: 'Operadora confirmou',
      actor: { type: 'user', id: 'analyst@pipo.health' },
      completion: {
        members: [
          { tax_id: '12345678900', id_card_number: '0001234500018', effective_date: '2026-10-01' },
        ],
        end_date: null,
        effective_date: null,
        mecsas_company_code: 'MX1',
        has_grace_period: false,
        carrier_tracking_number: null,
        document_types: null,
      },
    })
  })

  it('carries no completion out of a transition that does not complete', () => {
    const payload = statusChangedPayload('d', change({ toStatus: 'cancelled' }))

    expect(payload.completion).toBeNull()
  })

  it('carries a null completion when a forced completion answered nothing', () => {
    const payload = statusChangedPayload('d', change({ completion: null }))

    expect(payload.completion).toBeNull()
  })
})
