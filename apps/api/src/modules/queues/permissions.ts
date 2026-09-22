import type { GroupNode } from '../groups/hierarchy.js'
import type { Membership } from '../groups/repository.js'

/** Who is asking, and whether they hold the structure policy — which is the
 *  key to the whole tree, not a role inside one group. */
export interface Viewer {
  id: string
  structureAdmin: boolean
}

/** Enough of a view to answer the question — the same check runs on a stored
 *  row and on a body about to be written. */
export interface ViewOwnership {
  ownerId: string | null
  groupId: string | null
}

/** Twin of canEditStructure in web/src/lib/pipodesk/permissions.ts: admin in
 *  the group or in any ancestor. `seen` guards a parentId cycle. */
export function isAdminOfGroupOrAncestor(
  nodes: readonly GroupNode[],
  memberships: readonly Membership[],
  groupId: string,
): boolean {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]))
  const admin = new Set(
    memberships.filter((m) => m.role === 'admin').map((membership) => membership.groupId),
  )

  let current: string | null = groupId
  const seen = new Set<string>()
  while (current !== null && !seen.has(current)) {
    if (admin.has(current)) return true
    seen.add(current)
    current = parentOf.get(current) ?? null
  }
  return false
}

/** The refusal the caller reads, or `null` when the view is theirs to edit. A
 *  team view with no group answers to the structure policy alone. */
export function editRefusal(
  view: ViewOwnership,
  viewer: Viewer,
  nodes: readonly GroupNode[],
  memberships: readonly Membership[],
): string | null {
  if (view.ownerId !== null) {
    return view.ownerId === viewer.id ? null : 'A personal view is edited by its owner alone'
  }

  if (viewer.structureAdmin) return null
  if (view.groupId !== null && isAdminOfGroupOrAncestor(nodes, memberships, view.groupId)) {
    return null
  }

  return 'A team view is edited by the coordination of its group or of an ancestor'
}
