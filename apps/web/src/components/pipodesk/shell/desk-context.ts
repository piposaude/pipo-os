import { createContext, useContext, type Dispatch } from 'react'
import type { QueueView, QueueAction } from '@/lib/pipodesk/queue-view'
import type { TicketPatch } from '@/lib/pipodesk/patches'
import type { CommentChannel, TicketComment } from '@/lib/pipodesk/timeline'
import type { TreeSection } from '@/lib/pipodesk/tree'
import type { StructureState } from '@/lib/pipodesk/structure'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'

/**
 * What the shell holds and every screen reads. Sidebar and queue are the same
 * question from two places — node count must match the list, which only holds
 * when both derive from the same base and filter. When the API arrives, only
 * the source of `rows` changes.
 */
export interface DeskContextValue {
  sections: TreeSection[]
  view: QueueView
  dispatch: Dispatch<QueueAction>
  /** Pods, memberships and saved views, as the API serves them. */
  structure: StructureState
  structurePending: boolean
  /** The pod the viewer works in, `null` when they belong to none. */
  viewerGroupId: string | null
  /** The whole base, before scope, window and filter. */
  rows: TicketRow[]
  rowsPending: boolean
  /** What the projection says exists, which is more than `rows` when it
   *  capped the answer — every count on screen is over the slice, not this. */
  rowsTotal: number
  rowsTruncated: boolean
  /** Queue reference date — never the clock, for reproducibility. */
  today: string
  viewerId: string
  resolveName: (userId: string) => string
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  /** Applies a patch to tickets — the prototype's mutation model until the
   *  real PATCH exists, when this becomes optimistic cache. */
  applyPatch: (ids: string[], patch: TicketPatch) => void
  patchRow: (row: TicketRow) => TicketRow
  /** Session comments. Gone on reload; persisting is PD-040. */
  comments: TicketComment[]
  addComment: (ticketId: string, channel: CommentChannel, body: string) => void
}

export const DeskContext = createContext<DeskContextValue | null>(null)

export function useDesk(): DeskContextValue {
  const value = useContext(DeskContext)
  if (value === null) {
    throw new Error('useDesk precisa de um DeskShell acima na árvore.')
  }
  return value
}
