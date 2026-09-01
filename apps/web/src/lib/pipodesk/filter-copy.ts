/**
 * Filter copy, outside any component so domain tests can prove the chips
 * without importing React. Name resolution comes in via `LabelContext` —
 * names live on the API rows (and later `GET /companies` + users module).
 */

import { DISPLAY_STATUS_COPY, PENDING_REASON_COPY } from '@/constants/pipodesk/status'
import {
  ENROLLMENT_TYPE_COPY,
  PORTE_COPY,
  PRIORITY_COPY,
  PRODUCT_COPY,
  VINCULO_COPY,
} from '@/constants/pipodesk/domain'
import { toDisplayStatus, type ApiStatus } from './status'
import type { FilterField, TicketFilter } from './filter'
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
  portes: 'Porte',
  origins: 'Origem',
  tags: 'Tag',
  assigneeIds: 'Dono',
  contractTypes: 'Contrato',
  vinculos: 'Vínculo',
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

/** Per-field display sentinels for `null` — each field's null has its own
 *  name, or a ticket without priority reads "Prioridade é Livre no pod". */
export const SENTINELA_NULO: Partial<Record<FilterField, string>> = {
  assigneeIds: 'livre',
  priorities: 'sem',
}

const NULL_LABEL: Partial<Record<FilterField, string>> = {
  assigneeIds: 'Livre no pod',
  priorities: 'Sem prioridade',
}

/** Analyst-facing status label (6 display states + reason), translated by
 *  `status.ts` — no private map here. */
const statusLabel = (value: string): string => {
  const display = toDisplayStatus(value as ApiStatus)
  if (!display) return value
  const base = DISPLAY_STATUS_COPY[display.status] ?? value
  return display.reason ? `${base} · ${PENDING_REASON_COPY[display.reason]}` : base
}

/** Option label for chips and panel. Accepts `null` and resolves it here —
 *  this function knows each field's null. */
export function optionLabel(field: FilterField, value: string | null, ctx: LabelContext): string {
  if (value === null || value === SENTINELA_NULO[field]) {
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
    case 'portes':
      return PORTE_COPY[value] ?? value
    case 'origins':
      return ORIGIN_COPY[value] ?? value
    // `'@me'` is an internal token and must never reach the screen.
    case 'assigneeIds':
      return value === '@me' ? 'você' : ctx.userName(value)
    case 'contractTypes':
      return value === 'pj' ? 'PJ' : 'CLT'
    case 'vinculos':
      return VINCULO_COPY[value] ?? value
    case 'priorities':
      return PRIORITY_COPY[value] ?? value
    default:
      return value
  }
}

export interface FilterChip {
  field: FilterField
  text: string
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
    const values = filter[field] as (string | null)[] | undefined
    if (!values || values.length === 0) continue
    const fromNode = nodeFilter[field] as (string | null)[] | undefined
    if (
      fromNode &&
      fromNode.length === values.length &&
      fromNode.every((value, index) => value === values[index])
    ) {
      continue
    }

    const labels = values.map((value) => optionLabel(field, value, ctx))
    const text =
      labels.length <= 2 ? labels.join(' ou ') : `${labels[0]} e mais ${labels.length - 1}`

    /* A single null value drops the field name: the label is already the whole
           sentence — "Prioridade é Sem prioridade" stutters. */
    const soNulo =
      values.length === 1 && (values[0] === null || values[0] === SENTINELA_NULO[field])
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
