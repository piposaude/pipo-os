// @vitest-environment node
import type { TicketStatus } from '@pipo-os/api-client'
import {
  API_STATUSES,
  DISPLAY_STATUSES,
  isOpen,
  toApiStatus,
  toDisplayStatus,
} from '@/lib/pipodesk/status'

describe('toDisplayStatus', () => {
  it('should keep the three statuses that already answer "whose turn is it"', () => {
    expect(toDisplayStatus('broker-processing')).toEqual({
      status: 'broker-processing',
      reason: null,
    })
    expect(toDisplayStatus('carrier-processing')).toEqual({
      status: 'carrier-processing',
      reason: null,
    })
    expect(toDisplayStatus('submitted-cancellation')).toEqual({
      status: 'submitted-cancellation',
      reason: null,
    })
  })

  it('should turn broker-open-issue into broker-processing with an internal reason', () => {
    expect(toDisplayStatus('broker-open-issue')).toEqual({
      status: 'broker-processing',
      reason: 'internal-issue',
    })
  })

  it('should collapse the two client-side statuses into client-pending plus reason', () => {
    expect(toDisplayStatus('missing-documents')).toEqual({
      status: 'client-pending',
      reason: 'missing-documents',
    })
    expect(toDisplayStatus('incorrect-data')).toEqual({
      status: 'client-pending',
      reason: 'incorrect-data',
    })
  })

  it('should keep the final statuses without a reason', () => {
    expect(toDisplayStatus('completed')).toEqual({ status: 'completed', reason: null })
    expect(toDisplayStatus('cancelled')).toEqual({ status: 'cancelled', reason: null })
  })
})

describe('toApiStatus', () => {
  it('should return the api status for every valid pair', () => {
    expect(toApiStatus('broker-processing', null)).toBe('broker-processing')
    expect(toApiStatus('broker-processing', 'internal-issue')).toBe('broker-open-issue')
    expect(toApiStatus('carrier-processing', null)).toBe('carrier-processing')
    expect(toApiStatus('client-pending', 'missing-documents')).toBe('missing-documents')
    expect(toApiStatus('client-pending', 'incorrect-data')).toBe('incorrect-data')
    expect(toApiStatus('submitted-cancellation', null)).toBe('submitted-cancellation')
    expect(toApiStatus('completed', null)).toBe('completed')
    expect(toApiStatus('cancelled', null)).toBe('cancelled')
  })

  it('should reject client-pending without a reason, because the api has no such status', () => {
    expect(toApiStatus('client-pending', null)).toBeNull()
  })

  it('should reject a reason that does not belong to the display status', () => {
    expect(toApiStatus('client-pending', 'internal-issue')).toBeNull()
    expect(toApiStatus('carrier-processing', 'missing-documents')).toBeNull()
    expect(toApiStatus('completed', 'incorrect-data')).toBeNull()
  })
})

describe('status round trip', () => {
  it('should map every api status back to itself through the display pair', () => {
    for (const status of API_STATUSES) {
      const display = toDisplayStatus(status)
      expect(toApiStatus(display.status, display.reason)).toBe(status)
    }
  })

  it('should cover the eight api statuses and the six display statuses', () => {
    expect(API_STATUSES).toHaveLength(8)
    expect(DISPLAY_STATUSES).toHaveLength(6)
    expect(new Set(API_STATUSES.map((s) => toDisplayStatus(s).status)).size).toBe(6)
  })
})

describe('isOpen', () => {
  it('should treat completed and cancelled as closed', () => {
    expect(isOpen('completed')).toBe(false)
    expect(isOpen('cancelled')).toBe(false)
  })

  it('should treat submitted-cancellation as still open, because the carrier has not confirmed', () => {
    expect(isOpen('submitted-cancellation')).toBe(true)
  })

  it('should treat the working statuses as open', () => {
    const working: TicketStatus[] = [
      'broker-processing',
      'carrier-processing',
      'broker-open-issue',
      'missing-documents',
      'incorrect-data',
    ]
    for (const status of working) expect(isOpen(status)).toBe(true)
  })
})
