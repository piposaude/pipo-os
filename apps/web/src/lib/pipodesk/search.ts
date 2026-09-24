/**
 * Global search (⌘K). A result is a synthetic node handed to the same
 * `select-node` as the sidebar — search has no private path to the queue, so
 * the count invariant holds there too. Client-side over the rows at hand;
 * `GET /api/search` (PD-080) takes over later without changing the palette.
 */

import { COMPANY_STRUCTURE_COPY } from '@/constants/pipodesk/domain'
import { normalizeText as normalize } from './filter'
import { toQueueNode } from './queue-node'
import type { QueueNode } from './queue-view'
import { SEARCH_NODE_PREFIX, type TreeNode, type TreeSection } from './tree'
import { principalIdOf, type TicketRow } from './ticket-row'

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

/** What the row projection does not carry: the API has none of it until
 *  PD-043, so every use degrades when the id is absent. */
export interface CompanyRecord {
  legalName: string
  cnpj: string
}

const digitsOf = (text: string): string => text.replace(/\D/g, '')

export function companyRegistryOf(rows: TicketRow[]): Record<string, CompanyRecord> {
  const registry: Record<string, CompanyRecord> = {}
  for (const row of rows) {
    if (!row.companyName || registry[row.companyId]?.cnpj) continue
    registry[row.companyId] = { legalName: row.companyName, cnpj: row.companyTaxId ?? '' }
  }
  return registry
}

/** Trade name, legal name, or the digits of the CNPJ — the dataset shares a
 *  trade name between companies, so the other two are how they are told apart. */
const matchesCompany = (
  row: TicketRow,
  record: CompanyRecord | undefined,
  needle: string,
  digitsNeedle: string,
): boolean => {
  if (row.companyName && normalize(row.companyName).includes(needle)) return true
  if (record && normalize(record.legalName).includes(needle)) return true
  return (
    digitsNeedle.length >= 3 && record !== undefined && digitsOf(record.cnpj).includes(digitsNeedle)
  )
}

/** `Matriz` or `Filial de X`, plus the CNPJ when it is known. */
const companyDetail = (parentName: string | null, cnpj: string | undefined): string => {
  const structure = parentName
    ? COMPANY_STRUCTURE_COPY.branch(parentName)
    : COMPANY_STRUCTURE_COPY.parent
  return cnpj ? `${structure} · ${cnpj}` : structure
}

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

export function searchQueue(
  query: string,
  rows: TicketRow[],
  sections: TreeSection[],
  /** Legal name and CNPJ by company id. Optional: the row projection carries
   *  neither until PD-043, and without them two branches of a parent read alike. */
  companies: Record<string, CompanyRecord> = {},
): SearchGroup[] {
  const needle = normalize(query.trim())
  if (needle.length === 0) return []

  const chamados: SearchHit[] = []
  const porPessoa = new Map<string, TicketRow[]>()
  const porEmpresa = new Map<string, { name: string; parentName: string | null }>()
  /* Counted for every company, not only the matched ones, and under the parent
     as well: the node filter opens a parent's branches, so the count says so. */
  const ticketsPorEmpresa = new Map<string, number>()
  const digitsNeedle = digitsOf(query)

  for (const row of rows) {
    // Both keys: the UUID (links, logs) and the number someone pastes from Slack.
    const byNumber =
      typeof row.displayNumber === 'string' && normalize(row.displayNumber).includes(needle)
    if (row.id.includes(needle) || byNumber) {
      const label = `Chamado ${row.displayNumber ?? row.id}`
      chamados.push({
        key: `ticket-${row.id}`,
        category: 'chamado',
        label,
        detail: row.subject,
        count: null,
        node: syntheticNode(`ticket-${row.id}`, label, { ticketIds: [row.id] }),
      })
    }
    if (row.beneficiaryName && normalize(row.beneficiaryName).includes(needle)) {
      // Name + company: homonyms in different companies stay two results.
      const personKey = `${row.beneficiaryName}::${row.companyId}`
      const bucket = porPessoa.get(personKey)
      if (bucket) bucket.push(row)
      else porPessoa.set(personKey, [row])
    }
    const principal = principalIdOf(row)
    ticketsPorEmpresa.set(row.companyId, (ticketsPorEmpresa.get(row.companyId) ?? 0) + 1)
    if (principal !== row.companyId) {
      ticketsPorEmpresa.set(principal, (ticketsPorEmpresa.get(principal) ?? 0) + 1)
    }

    const record = companies[row.companyId]
    const name = record?.legalName ?? row.companyName
    if (name && matchesCompany(row, record, needle, digitsNeedle)) {
      porEmpresa.set(row.companyId, { name, parentName: row.parentCompanyName })
    }
  }

  const beneficiarios: SearchHit[] = [...porPessoa.entries()].map(([personKey, tickets]) => {
    const name = tickets[0].beneficiaryName ?? personKey
    return {
      key: `person-${personKey}`,
      category: 'beneficiario',
      label: name,
      detail: tickets[0].companyName ?? '',
      count: tickets.length,
      node: syntheticNode(`person-${personKey}`, name, { ticketIds: tickets.map((t) => t.id) }),
    }
  })

  const empresas: SearchHit[] = [...porEmpresa.entries()].map(([companyId, info]) => ({
    key: `company-${companyId}`,
    category: 'empresa',
    label: info.name,
    detail: companyDetail(info.parentName, companies[companyId]?.cnpj),
    count: ticketsPorEmpresa.get(companyId) ?? 0,
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
