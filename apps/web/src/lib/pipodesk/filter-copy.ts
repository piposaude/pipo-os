/**
 * Filter copy, outside any component so domain tests can prove the chips
 * without importing React. Name resolution comes in via `LabelContext` —
 * names live on the API rows (and later `GET /companies` + users module).
 */

import { DISPLAY_STATUS_COPY, PENDING_REASON_COPY } from '@/constants/pipodesk/status'
import {
  ENROLLMENT_TYPE_COPY,
  COMPANY_SIZE_COPY,
  PRIORITY_COPY,
  PRODUCT_COPY,
  RELATIONSHIP_COPY,
} from '@/constants/pipodesk/domain'
import { isApiStatus, toDisplayStatus } from './status'
import { assertNever, NULL_TOKEN, valuesOf, type FilterField, type TicketFilter } from './filter'
import { isPriority } from './ticket-row'
import type { GroupBy } from './group'

/** Resolves ids to names. Each falls back to the id itself — an id on
 *  screen is a defect, a broken row is worse. */
export interface LabelContext {
  companyName: (id: string) => string
  carrierName: (id: string) => string
  userName: (id: string) => string
}

/** THE field order — panel and chips both follow it. `priorities` sits by
 *  `statuses` (both are ticket state). `groupIds` is out on purpose: node
 *  scope is not a removable chip. */
export const FILTER_FIELD_COPY: Partial<Record<FilterField, string>> & Record<string, string> = {
  statuses: 'Status',
  priorities: 'Prioridade',
  companyIds: 'Empresa',
  carrierIds: 'Operadora',
  products: 'Produto',
  types: 'Tipo',
  companySizes: 'Porte',
  origins: 'Origem',
  tags: 'Tag',
  assigneeIds: 'Dono',
  contractTypes: 'Contrato',
  relationships: 'Vínculo',
}

/** All filterable fields, derived from the copy table — the prototype had
 *  four hand-written copies and the stale one cost a missing chip. */
export const FILTER_FIELDS = Object.keys(FILTER_FIELD_COPY) as FilterField[]

/** Origin copy. Column and panel read the same table. */
export const ORIGIN_COPY: Record<string, string> = {
  'enrollment-integrations': 'Automático',
  'automation-failure': 'Falha',
  broker: 'Corretor',
  'back-office': 'Backoffice',
  agent: 'Agent',
  web: 'Manual',
}

const NULL_LABEL: Partial<Record<FilterField, string>> = {
  assigneeIds: 'Livre no pod',
  priorities: 'Sem prioridade',
  contractTypes: 'Sem contrato',
}

/** Analyst-facing status label (6 display states + reason), translated by
 *  `status.ts` — no private map here. */
const statusLabel = (value: string): string => {
  // The cast this replaced hid the fact that `value` is unvalidated, making the
  // guard below look like dead code — one cleanup away from a crash.
  if (!isApiStatus(value)) return value
  const display = toDisplayStatus(value)
  const base = DISPLAY_STATUS_COPY[display.status] ?? value
  return display.reason ? `${base} · ${PENDING_REASON_COPY[display.reason]}` : base
}

/** Option label for chips and panel. Accepts `null` and resolves it here —
 *  this function knows each field's null. */
export function optionLabel(field: FilterField, value: string | null, ctx: LabelContext): string {
  if (value === null || value === NULL_TOKEN) {
    return NULL_LABEL[field] ?? value ?? ''
  }
  switch (field) {
    case 'statuses':
      return statusLabel(value)
    case 'companyIds':
      return ctx.companyName(value)
    case 'carrierIds':
      return ctx.carrierName(value)
    case 'products':
      return PRODUCT_COPY[value] ?? value
    case 'types':
      return ENROLLMENT_TYPE_COPY[value] ?? value
    case 'companySizes':
      return COMPANY_SIZE_COPY[value] ?? value
    case 'origins':
      return ORIGIN_COPY[value] ?? value
    // `'@me'` is an internal token and must never reach the screen.
    case 'assigneeIds':
      return value === '@me' ? 'você' : ctx.userName(value)
    case 'contractTypes':
      // The snapshot vocabulary is open — an unknown value shows raw, not "CLT".
      return value === 'pj' ? 'PJ' : value === 'clt' ? 'CLT' : value
    case 'relationships':
      return RELATIONSHIP_COPY[value] ?? value
    case 'priorities':
      return isPriority(value) ? PRIORITY_COPY[value] : value
    case 'tags':
      return value
    // Node scope, never a chip — there is no pod name to resolve.
    case 'groupIds':
      return value
    default:
      return assertNever(field)
  }
}

export interface FilterChip {
  field: FilterField
  text: string
}

/** Order-insensitive equality between two filter value lists. */
const sameValues = (a: readonly (string | null)[], b: readonly (string | null)[]): boolean => {
  if (a.length !== b.length) return false
  const rest = [...b]
  return a.every((value) => {
    const at = rest.indexOf(value)
    if (at === -1) return false
    rest.splice(at, 1)
    return true
  })
}

/**
 * Chips read as sentences. Only what the person added on top of the node
 * becomes a chip — the node's own filter already lights the sidebar, and its
 * × would contradict the queue's name. Compared by value: `select-node`
 * copies the filter object.
 */
export function filterChipsOf(
  filter: TicketFilter,
  nodeFilter: TicketFilter,
  ctx: LabelContext,
): FilterChip[] {
  const chips: FilterChip[] = []
  for (const field of FILTER_FIELDS) {
    const values = valuesOf(filter, field)
    if (values.length === 0) continue
    const fromNode = valuesOf(nodeFilter, field)
    // Compared as sets: the values are an OR, so another order is the same
    // filter — positionally, a hand-built URL grew a chip nobody added.
    if (fromNode.length > 0 && sameValues(fromNode, values)) continue

    const labels = values.map((value) => optionLabel(field, value, ctx))
    const text =
      labels.length <= 2 ? labels.join(' ou ') : `${labels[0]} e mais ${labels.length - 1}`

    /* A single null value drops the field name: the label is already the whole
           sentence — "Prioridade é Sem prioridade" stutters. */
    const soNulo = values.length === 1 && (values[0] === null || values[0] === NULL_TOKEN)
    chips.push({ field, text: soNulo ? labels[0] : `${FILTER_FIELD_COPY[field]} é ${text}` })
  }
  return chips
}

/** Grouping options, in menu order. */
export const GROUP_BY_COPY: Record<GroupBy, string> = {
  status: 'Status',
  company: 'Cliente',
  product: 'Produto',
  assignee: 'Dono',
  none: 'Nenhum',
}

/** The sorts `sortTickets` knows, labeled like the column headers —
 *  "Parado", not `updatedAt`. */
export const SORT_COPY: Record<string, string> = {
  actionDate: 'Prazo',
  createdAt: 'Criação',
  updatedAt: 'Parado',
  company: 'Empresa',
  status: 'Status',
}

export const DIRECTION_COPY: Record<'asc' | 'desc', string> = {
  asc: 'crescente',
  desc: 'decrescente',
}

/** Opening windows. They stop where they still cut something — a "6 months"
 *  option over a 90-day dataset filters nothing. */
export const DATE_WINDOWS: { days: number | null; label: string }[] = [
  { days: 7, label: 'Últimos 7 dias' },
  { days: 30, label: 'Últimos 30 dias' },
  { days: null, label: 'Todo o período' },
]
