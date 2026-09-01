/**
 * Global search (⌘K). A result is a synthetic node handed to the same
 * `select-node` as the sidebar — search has no private path to the queue, so
 * the count invariant holds there too. Client-side over the rows at hand;
 * `GET /api/search` (PD-080) takes over later without changing the palette.
 */

import type { QueueNode } from './queue-view'
import { SEARCH_NODE_PREFIX, type TreeNode, type TreeSection } from './tree'
import type { TicketRow } from './ticket-row'

export type SearchCategory = 'chamado' | 'beneficiario' | 'empresa' | 'visao'

export const CATEGORY_COPY: Record<SearchCategory, string> = {
  chamado: 'Chamados',
  beneficiario: 'Beneficiários',
  empresa: 'Empresas',
  visao: 'Visões da fila',
}

/** Tickets first — someone pastes a number from Slack. Views last: that is
 *  navigation, not case lookup. */
export const CATEGORY_ORDER: SearchCategory[] = ['chamado', 'beneficiario', 'empresa', 'visao']

export interface SearchHit {
  key: string
  category: SearchCategory
  /** Top line — what matched the query. */
  label: string
  /** Bottom line — context to break homonyms. */
  detail: string
  /** How many tickets the result opens. `null` when not applicable. */
  count: number | null
  node: QueueNode
}

export interface SearchGroup {
  category: SearchCategory
  hits: SearchHit[]
  /** Total found — may exceed `hits.length`. */
  total: number
}

export const MAX_PER_CATEGORY = 5

/** Accent- and case-insensitive: `Conceição` must match `conceicao`. */
const normalize = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Synthetic search node. Crosses the window (`all`) on purpose: yesterday's
 *  closed ticket is exactly what one looks up by number. */
const syntheticNode = (key: string, label: string, filter: QueueNode['filter']): QueueNode => ({
  id: `${SEARCH_NODE_PREFIX}${key}`,
  label,
  filter,
  groupId: null,
  windowMode: 'all',
  labelPath: ['Busca', label],
  sort: { by: 'updatedAt', direction: 'desc' },
})

const treeNodes = (sections: TreeSection[]): TreeNode[] => {
  const out: TreeNode[] = []
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      out.push(node)
      walk(node.children)
    }
  }
  for (const section of sections) walk(section.nodes)
  return out
}

const toQueueNode = (node: TreeNode): QueueNode => ({
  id: node.id,
  label: node.label,
  filter: node.filter,
  groupId: node.groupId,
  windowMode: node.windowMode,
  labelPath: node.path,
  sort: node.sort,
  ...(node.groupBy ? { groupBy: node.groupBy } : {}),
})

export function searchQueue(
  query: string,
  rows: TicketRow[],
  sections: TreeSection[],
): SearchGroup[] {
  const needle = normalize(query.trim())
  if (needle.length === 0) return []

  const chamados: SearchHit[] = []
  const porPessoa = new Map<string, TicketRow[]>()
  const porEmpresa = new Map<string, { name: string; count: number }>()

  for (const row of rows) {
    if (row.id.includes(needle)) {
      chamados.push({
        key: `ticket-${row.id}`,
        category: 'chamado',
        label: `Chamado ${row.id}`,
        detail: row.subject,
        count: null,
        node: syntheticNode(`ticket-${row.id}`, `Chamado ${row.id}`, { ticketIds: [row.id] }),
      })
    }
    if (row.beneficiaryName && normalize(row.beneficiaryName).includes(needle)) {
      const bucket = porPessoa.get(row.beneficiaryName)
      if (bucket) bucket.push(row)
      else porPessoa.set(row.beneficiaryName, [row])
    }
    if (row.companyName && normalize(row.companyName).includes(needle)) {
      const atual = porEmpresa.get(row.companyId)
      porEmpresa.set(row.companyId, {
        name: row.companyName,
        count: (atual?.count ?? 0) + 1,
      })
    }
  }

  const beneficiarios: SearchHit[] = [...porPessoa.entries()].map(([name, tickets]) => ({
    key: `person-${name}`,
    category: 'beneficiario',
    label: name,
    detail: tickets[0].companyName ?? '',
    count: tickets.length,
    node: syntheticNode(`person-${name}`, name, { ticketIds: tickets.map((t) => t.id) }),
  }))

  const empresas: SearchHit[] = [...porEmpresa.entries()].map(([companyId, info]) => ({
    key: `company-${companyId}`,
    category: 'empresa',
    label: info.name,
    detail: 'Todos os chamados da empresa',
    count: info.count,
    node: syntheticNode(`company-${companyId}`, info.name, { companyIds: [companyId] }),
  }))

  const visoes: SearchHit[] = treeNodes(sections)
    .filter((node) => normalize(node.label).includes(needle))
    .map((node) => ({
      key: `view-${node.id}`,
      category: 'visao',
      label: node.label,
      detail: node.path.join(' › '),
      count: node.count,
      node: toQueueNode(node),
    }))

  const byCategory: Record<SearchCategory, SearchHit[]> = {
    chamado: chamados,
    beneficiario: beneficiarios,
    empresa: empresas,
    visao: visoes,
  }

  return CATEGORY_ORDER.flatMap((category) => {
    const hits = byCategory[category]
    if (hits.length === 0) return []
    return [{ category, hits: hits.slice(0, MAX_PER_CATEGORY), total: hits.length }]
  })
}

/** Empty state: the most-used views — real data, real counts, teaching the
 *  shortcut without inventing a "favorite" entity. */
export function defaultHits(sections: TreeSection[]): SearchHit[] {
  const nodes = treeNodes(sections)
  const wanted = ['node-meus-tickets', 'node-urgentes', 'node-group-geben', 'node-geben']
  const picked = wanted
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is TreeNode => node !== undefined)

  return picked.map((node) => ({
    key: `view-${node.id}`,
    category: 'visao' as const,
    label: node.label,
    detail: node.path.join(' › '),
    count: node.count,
    node: toQueueNode(node),
  }))
}

export const hitCountLabel = (hit: SearchHit): string =>
  hit.count === null ? '' : String(hit.count)
