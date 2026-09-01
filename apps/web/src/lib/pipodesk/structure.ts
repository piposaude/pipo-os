/**
 * The editable structure: groups, memberships and saved queues (ported from
 * the prototype). A queue is a saved filter, not a ticket column — which is
 * why `tickets.queue_id` is slated for deprecation (PD-053).
 */

import type { Group, MemberRole, Membership, Structure } from './permissions'
import type { TicketFilter } from './filter'
import type { TicketSort } from './sort'
import type { GroupBy } from './group'

export interface Queue {
  id: string
  name: string
  groupId: string
  /** `null` = team view (admin-edited). Set = personal view (owner-edited). */
  ownerId: string | null
  /** Subscribers. The Favorites section derives from this — a separate list
   *  would drift from the star on the row. */
  subscriberIds: string[]
  filter: TicketFilter
  sort: TicketSort
  groupBy?: GroupBy
}

export interface StructureState extends Structure {
  queues: Queue[]
}

export const queuesOf = (structure: StructureState, groupId: string): Queue[] =>
  structure.queues.filter((queue) => queue.groupId === groupId)

/** Favorite = subscription, not ownership. */
export const isFavorite = (queue: Queue, userId: string): boolean =>
  queue.subscriberIds.includes(userId)

export const favoriteQueuesOf = (structure: StructureState, userId: string): Queue[] =>
  structure.queues.filter((queue) => isFavorite(queue, userId))

/** Companies no pod carries — the triage bucket. Takes the company universe
 *  from outside (operation data) so triage cannot derive itself empty. */
export function unallocatedCompanyIdsOf(structure: StructureState, companyIds: string[]): string[] {
  const carried = new Set(structure.groups.flatMap((group) => group.companyIds))
  return companyIds.filter((companyId) => !carried.has(companyId))
}

export type { Group, Membership, MemberRole, Structure }
