import { sourceQueueIdOf, type TreeNode } from '@/lib/pipodesk/tree'

/**
 * Which glyph each tree row gets. Separate file: data, not JSX — mixing
 * exports breaks Vite fast refresh.
 */
export type SidebarIconKind =
  | 'inbox'
  | 'my-tickets'
  | 'urgent'
  | 'new'
  | 'waiting'
  | 'resolved'
  | 'cancelled'
  | 'geben'
  | 'group'

/** Analyst rows carry no icon on purpose — indentation only. */
export function sidebarIconKindFor(node: TreeNode): SidebarIconKind | null {
  /* A favorite is a copy with a prefixed id; resolve the source or it would
       be the only glyph-less row among siblings. */
  const id = sourceQueueIdOf(node.id) ?? node.id

  switch (id) {
    case 'node-inbox':
      return 'inbox'
    case 'node-meus-tickets':
      return 'my-tickets'
    case 'node-urgentes':
      return 'urgent'
    case 'node-novos':
      return 'new'
    case 'node-em-espera':
      return 'waiting'
    case 'node-cancelamentos':
      return 'cancelled'
    case 'node-concluidos':
      return 'resolved'
    /* Triage, future moves and "Chamados" carry no glyph, like the prototype:
           the cube belongs to saved-queue rows. */
    default:
      break
  }

  if (/^node-(group-)?geben$/.test(id)) return 'geben'
  // The pod row itself.
  if (/^node-pod-[^-]+$/.test(id)) return 'group'
  // `Livres` is a pod-level row like the MOVs, so it takes the cube;
  // `Chamados` does not — plain text in the design.
  if (/^node-pod-.+-livres$/.test(id)) return 'group'
  if (/^queue-pod-.+-(clt|pj|mb)$/.test(id)) return 'group'
  return null
}
