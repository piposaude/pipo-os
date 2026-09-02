import type { TicketStatus } from '@pipo-os/api-client'

/**
 * The API stores 8 statuses (decision D2); the UI shows 6 states ("whose ball
 * is it") plus a separate pending reason. No information is lost — it changes
 * axis. This module is the only translator between the two vocabularies.
 */
export type ApiStatus = TicketStatus

export type DisplayStatus =
  | 'broker-processing'
  | 'carrier-processing'
  | 'client-pending'
  | 'submitted-cancellation'
  | 'completed'
  | 'cancelled'

/** Why the ticket stalled. A reason, not a state. */
export type PendingReason = 'missing-documents' | 'incorrect-data' | 'internal-issue'

export interface DisplayState {
  status: DisplayStatus
  reason: PendingReason | null
}

export const API_STATUSES: ApiStatus[] = [
  'broker-processing',
  'carrier-processing',
  'broker-open-issue',
  'missing-documents',
  'incorrect-data',
  'submitted-cancellation',
  'completed',
  'cancelled',
]

export const DISPLAY_STATUSES: DisplayStatus[] = [
  'broker-processing',
  'carrier-processing',
  'client-pending',
  'submitted-cancellation',
  'completed',
  'cancelled',
]

export const PENDING_REASONS: PendingReason[] = [
  'missing-documents',
  'incorrect-data',
  'internal-issue',
]

const TO_DISPLAY: Record<ApiStatus, DisplayState> = {
  'broker-processing': { status: 'broker-processing', reason: null },
  'carrier-processing': { status: 'carrier-processing', reason: null },
  'broker-open-issue': { status: 'broker-processing', reason: 'internal-issue' },
  'missing-documents': { status: 'client-pending', reason: 'missing-documents' },
  'incorrect-data': { status: 'client-pending', reason: 'incorrect-data' },
  'submitted-cancellation': { status: 'submitted-cancellation', reason: null },
  completed: { status: 'completed', reason: null },
  cancelled: { status: 'cancelled', reason: null },
}

/** Final states. `submitted-cancellation` is deliberately not final: a
 *  submitted cancellation is still in flight, awaiting the carrier. */
export const FINAL_STATUSES: ApiStatus[] = ['completed', 'cancelled']

/** Filter values arrive from the URL, which is hand-editable: a status string
 *  is only an `ApiStatus` after this check. */
export function isApiStatus(value: string): value is ApiStatus {
  return Object.prototype.hasOwnProperty.call(TO_DISPLAY, value)
}

export function toDisplayStatus(status: ApiStatus): DisplayState {
  return TO_DISPLAY[status]
}

/** UI pair back to the API status. Returns `null` for pairs that do not
 *  exist in the API (e.g. `client-pending` without a reason). */
export function toApiStatus(status: DisplayStatus, reason: PendingReason | null): ApiStatus | null {
  const match = API_STATUSES.find((api) => {
    const display = TO_DISPLAY[api]
    return display.status === status && display.reason === reason
  })
  return match ?? null
}

export function isOpen(status: ApiStatus): boolean {
  return !FINAL_STATUSES.includes(status)
}
