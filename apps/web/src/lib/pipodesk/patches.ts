/**
 * Mutation model while the backend does not exist (from the prototype): the
 * base never changes, actions become patches applied on read. When
 * `PATCH /tickets/:id` lands, the patch becomes the request body and this
 * state becomes optimistic cache — destination changes, shape does not.
 */

import { FINAL_STATUSES, toDisplayStatus, type ApiStatus } from './status'
import type { Priority, TicketRow } from './ticket-row'

export interface TicketPatch {
  assigneeId?: string | null
  status?: ApiStatus
  actionDate?: string | null
  /** `null` is a value ("remove priority"), absence is not — the spread keeps
   *  exactly that distinction. */
  priority?: Priority | null
  /** Move between pods. `groupId` is never null in the domain; clearing the
   *  owner is the `assigneeId: null` that usually comes along. */
  groupId?: string
}

/** Applies patches, deriving what status drags along (`display`, `reason`,
 * `closedAt`) — same contract as `ticket-row`. */
export function applyPatches(
  tickets: TicketRow[],
  patches: Record<string, TicketPatch>,
  today: string,
): TicketRow[] {
  if (Object.keys(patches).length === 0) return tickets

  return tickets.map((ticket) => {
    const patch = patches[ticket.id]
    if (!patch) return ticket

    const next: TicketRow = { ...ticket, ...patch }
    if (patch.status !== undefined) {
      const display = toDisplayStatus(patch.status)
      next.display = display.status
      next.reason = display.reason
      next.closedAt = FINAL_STATUSES.includes(patch.status)
        ? (ticket.closedAt ?? `${today}T12:00:00.000Z`)
        : null
    }
    return next
  })
}
