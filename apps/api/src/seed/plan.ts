import type { TicketFilter } from '../modules/tickets/filter-schema.js'

export type MemberRole = 'admin' | 'member'

export interface SeedSort {
  by: string
  direction: string
}

export interface SeedGroup {
  /** Local handle, not the database id: the tree is declared before it exists. */
  key: string
  name: string
  parentKey: string | null
}

export interface SeedQueue {
  groupKey: string
  name: string
  filters: TicketFilter
  sort: SeedSort
}

export interface SeedMember {
  groupKey: string
  userId: string
  role: MemberRole
}

export interface SeedStructure {
  groups: SeedGroup[]
  queues: SeedQueue[]
  members: SeedMember[]
}

export interface CurrentGroup {
  id: string
  name: string
  parentId: string | null
}

export interface CurrentQueue {
  id: string
  name: string
  groupId: string | null
  filters: TicketFilter | null
  sort: SeedSort
}

export interface CurrentMember {
  groupId: string
  userId: string
}

export interface CurrentStructure {
  groups: CurrentGroup[]
  queues: CurrentQueue[]
  members: CurrentMember[]
}

export type SeedAction =
  | { kind: 'create-group'; key: string; name: string; parentKey: string | null }
  | { kind: 'create-queue'; groupKey: string; name: string; filters: TicketFilter; sort: SeedSort }
  | { kind: 'add-member'; groupKey: string; userId: string; role: MemberRole }

export interface SeedDivergence {
  kind: 'queue'
  groupKey: string
  name: string
  fields: string[]
}

export interface SeedPlan {
  actions: SeedAction[]
  existing: { groups: number; queues: number; members: number }
  divergences: SeedDivergence[]
  groupIds: Record<string, string>
}

/** Array order is left alone on purpose: it is the order that was written,
 *  and sorting it here would hide a real difference. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : item,
  )
}

export function planSeed(desired: SeedStructure, current: CurrentStructure): SeedPlan {
  const actions: SeedAction[] = []
  const idByKey = new Map<string, string>()
  const existing = { groups: 0, queues: 0, members: 0 }
  const divergences: SeedDivergence[] = []

  for (const group of desired.groups) {
    const parentPending = group.parentKey !== null && !idByKey.has(group.parentKey)
    const parentId = group.parentKey === null ? null : (idByKey.get(group.parentKey) ?? null)
    const found = parentPending
      ? undefined
      : current.groups.find((row) => row.name === group.name && row.parentId === parentId)

    if (found) {
      idByKey.set(group.key, found.id)
      existing.groups += 1
      continue
    }
    actions.push({ kind: 'create-group', ...group })
  }

  for (const queue of desired.queues) {
    const groupId = idByKey.get(queue.groupKey)
    const found =
      groupId === undefined
        ? undefined
        : current.queues.find((row) => row.name === queue.name && row.groupId === groupId)

    if (found) {
      existing.queues += 1
      const fields = [
        ...(canonical(found.filters) === canonical(queue.filters) ? [] : ['filters']),
        ...(canonical(found.sort) === canonical(queue.sort) ? [] : ['sort']),
      ]
      if (fields.length > 0) {
        divergences.push({ kind: 'queue', groupKey: queue.groupKey, name: queue.name, fields })
      }
    } else {
      actions.push({ kind: 'create-queue', ...queue })
    }
  }

  for (const member of desired.members) {
    const groupId = idByKey.get(member.groupKey)
    const found =
      groupId === undefined
        ? undefined
        : current.members.find((row) => row.groupId === groupId && row.userId === member.userId)

    if (found) {
      existing.members += 1
    } else {
      actions.push({ kind: 'add-member', ...member })
    }
  }

  return { actions, existing, divergences, groupIds: Object.fromEntries(idByKey) }
}
