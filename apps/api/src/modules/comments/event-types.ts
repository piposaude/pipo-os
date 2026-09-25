import { z } from 'zod'

/**
 * What a service says happened, over `POST /api/tickets/:id/comments`. These
 * five are one to one with what the enrollment-integrations already writes into
 * Zendesk today — `hr_platform_reply` is the HR answer coming back from the
 * platform, `internal_note` the private note it posts on its own.
 */
export const SERVICE_EVENT_TYPES = [
  'hr_platform_reply',
  'enrollment_cancellation_requested',
  'document_signature_sent',
  'contractor_document_failed',
  'internal_note',
] as const

/**
 * What the API records about a ticket it changed itself, through `insertEvent`
 * and inside the transaction that moved the column. No caller can post one:
 * a line saying the ticket was assigned, with no assignment behind it, is a
 * chronology that lies to the operation reading it.
 */
export const API_EVENT_TYPES = [
  'assigned',
  'priority_changed',
  'action_date_changed',
  'moved',
  'document_attached',
  'pendency_changed',
] as const

/**
 * The whole vocabulary an automated event can name, pinned by a test to
 * contract/ticket-event-types.json. Closed on purpose: the chronology gives
 * each value its own copy and icon, so a word nobody named reaches the screen
 * raw.
 */
export const TICKET_EVENT_TYPES = [...SERVICE_EVENT_TYPES, ...API_EVENT_TYPES] as const

export const ticketEventTypeSchema = z.enum(TICKET_EVENT_TYPES)

/** Only the service half is writable over HTTP — see `API_EVENT_TYPES`. */
export const serviceEventTypeSchema = z.enum(SERVICE_EVENT_TYPES)

export type TicketEventType = z.infer<typeof ticketEventTypeSchema>
export type ServiceEventType = z.infer<typeof serviceEventTypeSchema>
