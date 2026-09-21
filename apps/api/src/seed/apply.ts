import type { TicketFilter } from '../modules/tickets/filter-schema.js'
import type { MemberRole, SeedPlan, SeedSort } from './plan.js'

export interface SeedClient {
  createGroup(body: { name: string; parentId: string | null }): Promise<{ id: string }>
  createQueue(body: {
    name: string
    groupId: string
    filters: TicketFilter
    sort: SeedSort
  }): Promise<{ id: string }>
  addMember(groupId: string, body: { userId: string; role: MemberRole }): Promise<void>
}

export interface ApplyOutcome {
  created: { groups: number; queues: number; members: number }
}

export async function applyPlan(plan: SeedPlan, client: SeedClient): Promise<ApplyOutcome> {
  const idByKey = new Map(Object.entries(plan.groupIds))
  const created = { groups: 0, queues: 0, members: 0 }

  const idOf = (key: string): string => {
    const id = idByKey.get(key)
    if (id === undefined) {
      throw new Error(`Seed: group ${key} has no id — the plan is out of order`)
    }
    return id
  }

  for (const action of plan.actions) {
    if (action.kind === 'create-group') {
      const parentId = action.parentKey === null ? null : idOf(action.parentKey)
      const group = await client.createGroup({ name: action.name, parentId })
      idByKey.set(action.key, group.id)
      created.groups += 1
      continue
    }

    if (action.kind === 'create-queue') {
      await client.createQueue({
        name: action.name,
        groupId: idOf(action.groupKey),
        filters: action.filters,
        sort: action.sort,
      })
      created.queues += 1
      continue
    }

    await client.addMember(idOf(action.groupKey), { userId: action.userId, role: action.role })
    created.members += 1
  }

  return { created }
}
