import type { OpenPendency, PendencyAction } from './schemas.js'

export interface PendencyEvent {
  action: PendencyAction
  itemIds: readonly string[]
  at: string
}

/** Folds the ticket's pendency_changed events, oldest first, into the items
 *  still missing. A charge on an open item counts again; a charge on an item
 *  that arrived opens a new cycle. */
export function openPendenciesOf(events: readonly PendencyEvent[]): OpenPendency[] {
  const cycles = new Map<string, { since: string; chargedCount: number; open: boolean }>()

  for (const event of events) {
    for (const itemId of event.itemIds) {
      const cycle = cycles.get(itemId)
      if (event.action === 'resolved') {
        if (cycle) cycle.open = false
      } else if (cycle?.open) {
        cycle.chargedCount += 1
      } else {
        cycles.set(itemId, { since: event.at, chargedCount: 1, open: true })
      }
    }
  }

  return [...cycles]
    .filter(([, cycle]) => cycle.open)
    .map(([itemId, { since, chargedCount }]) => ({ itemId, since, chargedCount }))
}
