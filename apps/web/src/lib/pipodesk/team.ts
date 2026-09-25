/**
 * The team page's three pure computations, ported from the prototype and kept
 * out of the screen so tests exercise the domain rule directly.
 */

import { membersOf } from './permissions'
import type { Group, MemberRole, StructureState } from './structure'
import type { TicketRow } from './ticket-row'

export interface UnownedCompanies {
  companies: number
  tickets: number
}

/**
 * The pod's coordination debt: companies in the group portfolio that nobody
 * carries. Their tickets DO have owners (rotation); the company does not.
 * Returns zero for the root group on purpose — its debt is a different one
 * (companies in no pod, which triage shows).
 */
export function unownedCompaniesOf(
  structure: StructureState,
  groupId: string,
  rows: TicketRow[],
): UnownedCompanies {
  const group = structure.groups.find((candidate) => candidate.id === groupId)
  if (!group || group.parentId === null) return { companies: 0, tickets: 0 }

  const carried = new Set(
    membersOf(structure, groupId).flatMap((membership) => membership.companyIds ?? []),
  )
  const unowned = new Set(group.companyIds.filter((companyId) => !carried.has(companyId)))

  return {
    companies: unowned.size,
    tickets: rows.filter((row) => unowned.has(row.companyId)).length,
  }
}

/** A person's sub-portfolio. Coordination usually has none. */
export function portfolioOf(structure: StructureState, groupId: string, userId: string): string[] {
  const membership = membersOf(structure, groupId).find((candidate) => candidate.userId === userId)
  return membership?.companyIds ?? []
}

function openByAssignee(rows: TicketRow[]): Map<string, number> {
  const open = new Map<string, number>()
  for (const row of rows) {
    if (row.assigneeId === null || row.closedAt !== null) continue
    open.set(row.assigneeId, (open.get(row.assigneeId) ?? 0) + 1)
  }
  return open
}

export interface MemberLoad {
  userId: string
  role: MemberRole
  companies: number
  /** OPEN tickets with the person — the column asks about load right now. */
  open: number
}

/**
 * Group members with load: coordination first, then analysts busiest-first —
 * the table answers "who is drowning", not the alphabet.
 */
export function membersWithLoad(
  structure: StructureState,
  groupId: string,
  rows: TicketRow[],
): MemberLoad[] {
  const open = openByAssignee(rows)

  return membersOf(structure, groupId)
    .map((membership) => ({
      userId: membership.userId,
      role: membership.role,
      companies: (membership.companyIds ?? []).length,
      open: open.get(membership.userId) ?? 0,
    }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1
      return b.open - a.open
    })
}

export interface RosterLine extends MemberLoad {
  /** The pods the person is in, by name. Never the root. */
  pods: Group[]
}

/**
 * The operation's page lists people, not the root's memberships: the root only
 * holds coordination. One line per person, admin anywhere reading as
 * coordination — the same climb `canEditStructure` does. Coordination first,
 * then analysts by pod, then by name.
 */
export function operationRoster(
  structure: StructureState,
  rows: TicketRow[],
  nameOf: (userId: string) => string,
): RosterLine[] {
  const open = openByAssignee(rows)
  const lines = new Map<string, RosterLine>()

  for (const membership of structure.memberships) {
    const group = structure.groups.find((candidate) => candidate.id === membership.groupId)
    if (!group) continue
    const line = lines.get(membership.userId) ?? {
      userId: membership.userId,
      role: 'member' as MemberRole,
      companies: 0,
      open: open.get(membership.userId) ?? 0,
      pods: [],
    }
    if (membership.role === 'admin') line.role = 'admin'
    line.companies += (membership.companyIds ?? []).length
    if (group.parentId !== null) line.pods.push(group)
    lines.set(membership.userId, line)
  }

  const byName = (a: Group, b: Group) => a.name.localeCompare(b.name)
  for (const line of lines.values()) line.pods.sort(byName)

  return [...lines.values()].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'admin' ? -1 : 1
    const pod = (a.pods[0]?.name ?? '').localeCompare(b.pods[0]?.name ?? '')
    return pod !== 0 ? pod : nameOf(a.userId).localeCompare(nameOf(b.userId))
  })
}
