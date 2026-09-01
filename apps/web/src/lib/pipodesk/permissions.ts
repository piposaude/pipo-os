/**
 * Who may edit what. Both rules climb the hierarchy: GEBEN coordination edits
 * any pod, pod coordination only its own. Analysts edit nothing structural —
 * but do edit their own personal views. Role comes from the membership, not a
 * global policy: the same person can be admin in one pod and member in another.
 */

export interface Group {
  id: string
  name: string
  parentId: string | null
  /** The pod's portfolio — the companies whose tickets land here. Lives on the
   *  group because it routes; the ticket only inherits the result. */
  companyIds: string[]
  /** Emoji or glyph name from the icon picker. Runtime subteams start bare. */
  icon?: string
}

export type MemberRole = 'admin' | 'member'

export interface Membership {
  userId: string
  groupId: string
  role: MemberRole
  /** The person's sub-portfolio. Empty = covers the whole pod. */
  companyIds?: string[]
}

export interface Structure {
  groups: Group[]
  memberships: Membership[]
}

/** A saved queue for permission purposes: `ownerId === null` = team view. */
export interface QueuePermissionInput {
  id: string
  groupId: string
  ownerId: string | null
}

/** True if the person is admin in the group or any ancestor. `seen` guards
 *  against a `parentId` cycle in editable data. */
export function canEditStructure(structure: Structure, userId: string, groupId: string): boolean {
  let current: string | null = groupId
  const seen = new Set<string>()

  while (current !== null && !seen.has(current)) {
    seen.add(current)
    const at: string = current
    const isAdmin = structure.memberships.some(
      (membership) =>
        membership.userId === userId && membership.groupId === at && membership.role === 'admin',
    )
    if (isAdmin) return true
    current = structure.groups.find((group) => group.id === at)?.parentId ?? null
  }
  return false
}

/** Personal view: owner only. Team view: group (or ancestor) admin only. */
export function canEditQueue(
  queue: QueuePermissionInput,
  structure: Structure,
  userId: string,
): boolean {
  if (queue.ownerId !== null) return queue.ownerId === userId
  return canEditStructure(structure, userId, queue.groupId)
}

/* Selectors, so sidebar and team page read the structure without repeating filters. */

export const rootGroupOf = (structure: Structure): Group | null =>
  structure.groups.find((group) => group.parentId === null) ?? null

export const childGroupsOf = (structure: Structure, parentId: string): Group[] =>
  structure.groups.filter((group) => group.parentId === parentId)

export const membersOf = (structure: Structure, groupId: string): Membership[] =>
  structure.memberships.filter((membership) => membership.groupId === groupId)

/** `role: 'member'` only — coordination is not an analyst in the tree. */
export const analystsOf = (structure: Structure, groupId: string): Membership[] =>
  membersOf(structure, groupId).filter((membership) => membership.role === 'member')

/** Ancestors, nearest first. Same cycle guard as `canEditStructure`. */
export function ancestorsOf(structure: Structure, groupId: string): Group[] {
  const chain: Group[] = []
  const seen = new Set<string>([groupId])
  let current = structure.groups.find((group) => group.id === groupId)?.parentId ?? null

  while (current !== null && !seen.has(current)) {
    seen.add(current)
    const parent = structure.groups.find((group) => group.id === current)
    if (!parent) break
    chain.push(parent)
    current = parent.parentId
  }
  return chain
}
