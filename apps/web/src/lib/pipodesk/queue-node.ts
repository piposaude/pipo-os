import type { QueueNode } from './queue-view'
import type { TreeNode } from './tree'

/**
 * The slice of a tree node the queue needs. Keeps the reducer off the full
 * `TreeNode`; the tree `path` becomes `labelPath`, the breadcrumb's name.
 */
export const toQueueNode = (node: TreeNode): QueueNode => ({
  id: node.id,
  label: node.label,
  filter: node.filter,
  groupId: node.groupId,
  windowMode: node.windowMode,
  labelPath: node.path,
  sort: node.sort,
  ...(node.groupBy ? { groupBy: node.groupBy } : {}),
})
