/**
 * One pass fills every pod node count: total, both contract cuts, the MB
 * cross-cut and per-analyst loads — O(tickets) instead of one applyFilter per
 * node. MB deliberately does not partition: an MB ticket is also CLT or PJ.
 */

import type { TicketRow } from './ticket-row'

/** Product family. Unknown products are NOT MB — the conservative default
 *  keeps the cross-cut honest. */
export const PRODUCT_FAMILY: Record<string, 'health-plan' | 'multi-benefit'> = {
  health: 'health-plan',
  dental: 'health-plan',
  life: 'multi-benefit',
  pharmacy: 'multi-benefit',
  gym: 'multi-benefit',
  pet: 'multi-benefit',
}

export interface AssigneeTally {
  clt: number
  pj: number
  mb: number
}

export interface PodTally {
  total: number
  clt: number
  pj: number
  mb: number
  byAssignee: Map<string, AssigneeTally>
}

export function tallyPods(base: TicketRow[]): Map<string, PodTally> {
  const pods = new Map<string, PodTally>()

  const empty = (): PodTally => ({ total: 0, clt: 0, pj: 0, mb: 0, byAssignee: new Map() })

  for (const ticket of base) {
    // No pod, no pod row: that ticket belongs to triage.
    if (ticket.groupId === null) continue

    let pod = pods.get(ticket.groupId)
    if (!pod) {
      pod = empty()
      pods.set(ticket.groupId, pod)
    }

    const isMB = ticket.product !== null && PRODUCT_FAMILY[ticket.product] === 'multi-benefit'
    // `clt` is the only affirmative value: missing/unknown counts as PJ, like the prototype.
    const isClt = ticket.contractType === 'clt'

    pod.total += 1
    if (isClt) pod.clt += 1
    else pod.pj += 1
    if (isMB) pod.mb += 1

    if (ticket.assigneeId !== null) {
      let person = pod.byAssignee.get(ticket.assigneeId)
      if (!person) {
        person = { clt: 0, pj: 0, mb: 0 }
        pod.byAssignee.set(ticket.assigneeId, person)
      }
      if (isClt) person.clt += 1
      else person.pj += 1
      if (isMB) person.mb += 1
    }
  }

  return pods
}
