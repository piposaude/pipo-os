/**
 * The team page's three pure computations, ported from the prototype and kept
 * out of the screen so tests exercise the domain rule directly.
 */

import { childGroupsOf, membersOf } from './permissions'
import { normalizeText } from './filter'
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

function assigneesByCompany(rows: TicketRow[]): Map<string, Set<string>> {
  const byCompany = new Map<string, Set<string>>()
  for (const row of rows) {
    if (row.assigneeId === null || row.closedAt !== null) continue
    const assignees = byCompany.get(row.companyId) ?? new Set<string>()
    assignees.add(row.assigneeId)
    byCompany.set(row.companyId, assignees)
  }
  return byCompany
}

const sharedAmong = (companyIds: string[], byCompany: Map<string, Set<string>>): number =>
  companyIds.filter((companyId) => (byCompany.get(companyId)?.size ?? 0) > 1).length

const coordinationFirst = (a: { role: MemberRole }, b: { role: MemberRole }): number =>
  a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1

export interface MemberLoad {
  userId: string
  role: MemberRole
  companies: number
  /** OPEN tickets with the person — the column asks about load right now. */
  open: number
  /** Companies of the portfolio with open work held by more than one person:
   *  from November each client has a single analyst. */
  shared: number
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
  const byCompany = assigneesByCompany(rows)

  return membersOf(structure, groupId)
    .map((membership) => ({
      userId: membership.userId,
      role: membership.role,
      companies: (membership.companyIds ?? []).length,
      open: open.get(membership.userId) ?? 0,
      shared: sharedAmong(membership.companyIds ?? [], byCompany),
    }))
    .sort((a, b) => coordinationFirst(a, b) || b.open - a.open)
}

export interface RosterLine extends MemberLoad {
  /** The pods the person is in, by name. Never the root. */
  pods: Group[]
  coordinatesOperation: boolean
}

/**
 * The operation's page lists people, not the root's memberships: the root only
 * holds coordination. One line per person, admin anywhere reading as
 * coordination. Coordination first, then analysts by pod, then by name.
 */
export function operationRoster(
  structure: StructureState,
  rows: TicketRow[],
  nameOf: (userId: string) => string,
): RosterLine[] {
  const open = openByAssignee(rows)
  const byCompany = assigneesByCompany(rows)
  const lines = new Map<string, RosterLine>()
  const portfolios = new Map<string, string[]>()

  for (const membership of structure.memberships) {
    const group = structure.groups.find((candidate) => candidate.id === membership.groupId)
    if (!group) continue
    const line = lines.get(membership.userId) ?? {
      userId: membership.userId,
      role: 'member' as MemberRole,
      companies: 0,
      open: open.get(membership.userId) ?? 0,
      shared: 0,
      pods: [],
      coordinatesOperation: false,
    }
    if (membership.role === 'admin') line.role = 'admin'
    if (membership.role === 'admin' && group.parentId === null) line.coordinatesOperation = true
    line.companies += (membership.companyIds ?? []).length
    portfolios.set(membership.userId, [
      ...(portfolios.get(membership.userId) ?? []),
      ...(membership.companyIds ?? []),
    ])
    if (group.parentId !== null) line.pods.push(group)
    lines.set(membership.userId, line)
  }

  const byName = (a: Group, b: Group) => a.name.localeCompare(b.name)
  for (const line of lines.values()) {
    line.pods.sort(byName)
    line.shared = sharedAmong(portfolios.get(line.userId) ?? [], byCompany)
  }

  return [...lines.values()].sort(
    (a, b) =>
      coordinationFirst(a, b) ||
      (a.pods[0]?.name ?? '').localeCompare(b.pods[0]?.name ?? '') ||
      nameOf(a.userId).localeCompare(nameOf(b.userId)),
  )
}

export interface Person {
  id: string
  name: string
}

/** Who can still join the group, by name without accents or case. */
export function candidatesFor(
  people: Person[],
  structure: StructureState,
  groupId: string,
  query: string,
): Person[] {
  const inGroup = new Set(membersOf(structure, groupId).map((membership) => membership.userId))
  const wanted = normalizeText(query.trim())
  return people.filter(
    (person) => !inGroup.has(person.id) && normalizeText(person.name).includes(wanted),
  )
}

/** The other pods the person is in, with how many companies they carry there. */
export function elsewhereOf(
  structure: StructureState,
  userId: string,
  groupId: string,
): { name: string; companies: number }[] {
  return structure.memberships.flatMap((membership) => {
    if (membership.userId !== userId || membership.groupId === groupId) return []
    const group = structure.groups.find((candidate) => candidate.id === membership.groupId)
    return group && group.parentId !== null
      ? [{ name: group.name, companies: (membership.companyIds ?? []).length }]
      : []
  })
}

/**
 * The memberships that adding the person creates. Coordination of the root is
 * coordination of the operation: admin in the root and in every pod, so each
 * pod's page lists them. An existing membership is left as it is.
 */
export function joinTargets(
  structure: StructureState,
  groupId: string,
  role: MemberRole,
  userId: string,
): { groupId: string; role: MemberRole }[] {
  const group = structure.groups.find((candidate) => candidate.id === groupId)
  const groups =
    group?.parentId === null && role === 'admin'
      ? [groupId, ...childGroupsOf(structure, groupId).map((child) => child.id)]
      : [groupId]
  return groups
    .filter(
      (target) =>
        !structure.memberships.some(
          (membership) => membership.userId === userId && membership.groupId === target,
        ),
    )
    .map((target) => ({ groupId: target, role }))
}
