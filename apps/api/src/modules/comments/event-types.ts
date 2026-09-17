import { z } from 'zod'

/**
 * What an automated event can say happened to a ticket. Closed on purpose: the
 * chronology gives each value its own copy and icon, so a word nobody named
 * would reach the screen raw.
 *
 * The five the EI already writes into Zendesk today keep their meaning, one to
 * one — `hr_platform_reply` is the HR answer coming back from the platform,
 * `internal_note` the private note it posts on its own. The four that follow
 * are what the API itself records about a ticket it changed.
 *
 * Pinned by a test to contract/ticket-event-types.json.
 */
export const TICKET_EVENT_TYPES = [
  'hr_platform_reply',
  'enrollment_cancellation_requested',
  'document_signature_sent',
  'contractor_document_failed',
  'internal_note',
  'assigned',
  'priority_changed',
  'action_date_changed',
  'document_attached',
] as const

export const ticketEventTypeSchema = z.enum(TICKET_EVENT_TYPES)

export type TicketEventType = z.infer<typeof ticketEventTypeSchema>
