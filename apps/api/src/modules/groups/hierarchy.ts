import { ValidationFailedError } from '../../shared/errors.js'

export interface GroupNode {
  id: string
  parentId: string | null
}

/** Also bounds every walk below: a cycle that got in through another door
 *  cannot spin forever. */
export const MAX_DEPTH = 3

function refuse(message: string, code: string): never {
  throw new ValidationFailedError(message, [{ field: 'parentId', message, code }])
}

function depthOf(byId: Map<string, GroupNode>, id: string): number {
  let depth = 1
  let current = byId.get(id)?.parentId ?? null
  while (current !== null && depth <= MAX_DEPTH) {
    depth += 1
    current = byId.get(current)?.parentId ?? null
  }
  return depth
}

function heightOf(nodes: readonly GroupNode[], id: string): number {
  let height = 1
  let level = new Set([id])
  while (height <= MAX_DEPTH) {
    const children = nodes.filter((node) => node.parentId !== null && level.has(node.parentId))
    if (children.length === 0) break
    level = new Set(children.map((child) => child.id))
    height += 1
  }
  return height
}

function isSelfOrDescendant(byId: Map<string, GroupNode>, id: string, ancestor: string): boolean {
  let current: string | null = id
  for (let step = 0; current !== null && step <= MAX_DEPTH; step += 1) {
    if (current === ancestor) return true
    current = byId.get(current)?.parentId ?? null
  }
  return false
}

/** `groupId` is the group being moved, absent when it is being created. */
export function assertParentIsValid(
  nodes: readonly GroupNode[],
  parentId: string | null,
  groupId?: string,
): void {
  const byId = new Map(nodes.map((node) => [node.id, node]))

  if (parentId === null) {
    const root = nodes.find((node) => node.parentId === null && node.id !== groupId)
    if (root) {
      refuse(`Group ${root.id} is already the root group`, 'root_already_exists')
    }
    return
  }

  if (!byId.has(parentId)) {
    refuse(`Parent group ${parentId} not found`, 'parent_not_found')
  }

  if (groupId !== undefined && isSelfOrDescendant(byId, parentId, groupId)) {
    refuse(
      `Group ${parentId} is ${groupId} itself or one of its descendants`,
      'parent_is_descendant',
    )
  }

  const height = groupId === undefined ? 1 : heightOf(nodes, groupId)
  if (depthOf(byId, parentId) + height > MAX_DEPTH) {
    refuse(`The group hierarchy is at most ${MAX_DEPTH} levels deep`, 'max_depth_exceeded')
  }
}
