import type { Author } from '../auth/authenticate.js'
import type { Ticket, TicketCompletion } from '../tickets/schemas.js'

export const STATUS_CHANGED_EVENT = 'ticket.status_changed'

export interface StatusChange {
  ticket: Pick<Ticket, 'id' | 'displayNumber' | 'enrollmentId' | 'companyId'>
  fromStatus: string | null
  toStatus: string
  reason: string | null
  actor: Author
  occurredAt: string
  completion: TicketCompletion | null
}

function completionPayload(completion: TicketCompletion) {
  return {
    members: completion.members.map((member) => ({
      tax_id: member.taxId,
      id_card_number: member.idCardNumber,
      effective_date: member.startDate,
    })),
    end_date: completion.endDate,
    effective_date: completion.effectiveDate,
    mecsas_company_code: completion.mecsasCompanyCode,
    has_grace_period: completion.hasGracePeriod,
    carrier_tracking_number: completion.carrierTrackingNumber,
    document_types: completion.documentTypes,
  }
}

export function statusChangedPayload(deliveryId: string, change: StatusChange) {
  return {
    delivery_id: deliveryId,
    event_type: STATUS_CHANGED_EVENT,
    occurred_at: change.occurredAt,
    ticket_id: change.ticket.id,
    display_number: change.ticket.displayNumber,
    enrollment_id: change.ticket.enrollmentId,
    company_id: change.ticket.companyId,
    from_status: change.fromStatus,
    to_status: change.toStatus,
    reason: change.reason,
    actor: { type: change.actor.type, id: change.actor.id },
    completion:
      change.toStatus === 'completed' && change.completion
        ? completionPayload(change.completion)
        : null,
  }
}
