/**
 * Formatting and date-derived reads. Every function takes `today` as a
 * parameter instead of reading the clock, so queues are reproducible in tests.
 */

const MS_PER_DAY = 86_400_000

const atMidnight = (isoDate: string): number => Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`)

export const daysBetween = (from: string, to: string): number =>
  Math.round((atMidnight(to) - atMidnight(from)) / MS_PER_DAY)

/** Positivo = atrasado, zero = hoje, negativo = ainda por vir. */
export const daysOverdue = (actionDate: string, today: string): number =>
  daysBetween(actionDate, today)

export const daysOpenOf = (createdAt: string, today: string): number =>
  daysBetween(createdAt, today)

/** `hoje`, `6d` (atrasado) ou `em 3d`. */
export function formatPrazo(actionDate: string, today: string): string {
  const days = daysOverdue(actionDate, today)
  if (days === 0) return 'hoje'
  return days > 0 ? `${days}d` : `em ${-days}d`
}

export type PrazoVariant = 'alert' | 'warning' | 'neutral'

/** Deadline pill color: overdue=alert, today=warning, future=neutral. `null`
 *  when there is no action date — empty cell, no gray-pill noise. */
export function prazoVariant(actionDate: string | null, today: string): PrazoVariant | null {
  if (actionDate === null) return null
  const days = daysOverdue(actionDate, today)
  if (days > 0) return 'alert'
  return days === 0 ? 'warning' : 'neutral'
}

/** `11/08`, or `03/12/25` when the year differs — never silently dropped. */
export function formatDayMonth(iso: string | null, today: string): string {
  if (!iso) return '—'
  const date = iso.slice(0, 10)
  if (Number.isNaN(Date.parse(date))) return '—'
  const [year, month, day] = date.split('-')
  return year === today.slice(0, 4) ? `${day}/${month}` : `${day}/${month}/${year.slice(2)}`
}

/* ── SLA contratual ────────────────────────────────────────────────────────── */

export type SlaState = 'ok' | 'warning' | 'breached'

export interface ContractualSla {
  hours: number
  hasPenalty: boolean
}

export interface SlaReading {
  daysOpen: number
  limitHours: number | null
  hasPenalty: boolean
  state: SlaState | null
}

/**
 * The middle step ("about to breach") is the LAST DAY, not a percentage: the
 * data is date-grained, not hour-grained. No contractual SLA → no state.
 */
export function slaOf(
  ticket: { createdAt: string },
  sla: ContractualSla | null,
  today: string,
): SlaReading {
  const daysOpen = daysOpenOf(ticket.createdAt, today)
  if (!sla) return { daysOpen, limitHours: null, hasPenalty: false, state: null }

  const limitDays = sla.hours / 24
  // `daysOpen` is an integer; a fractional limit (36h → 1,5) would make the
  // strict-equality "last day" unreachable, jumping ok → breached.
  const state: SlaState =
    daysOpen > limitDays ? 'breached' : daysOpen === Math.floor(limitDays) ? 'warning' : 'ok'

  return { daysOpen, limitHours: sla.hours, hasPenalty: sla.hasPenalty, state }
}

/** Readable name from the e-mail while the users module (PD-060) does not
 *  exist. Deliberately temporary; lives in one place. */
export function displayNameFromEmail(value: string): string {
  const at = value.indexOf('@')
  if (at <= 0 || value.startsWith('svc:')) return value

  return value
    .slice(0, at)
    .split('.')
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Node count with pt-BR thousands separator: 6749 → `6.749`. */
export function formatCount(count: number): string {
  return count.toLocaleString('pt-BR')
}

/** Sidebar-only shortening (one entry today). Shortens the RENDERED text,
 *  never the node label: breadcrumb, search and hover keep the full name. */
const SHORT_LABELS: Record<string, string> = {
  'Movimentações futuras': 'Mov. futuras',
}

export const shortSidebarLabel = (label: string): string => SHORT_LABELS[label] ?? label
