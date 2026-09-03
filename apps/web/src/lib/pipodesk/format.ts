/**
 * Formatting and date-derived reads. Every function takes `today` as a
 * parameter instead of reading the clock, so queues are reproducible in tests.
 */

const MS_PER_DAY = 86_400_000

/** `null` when the string is not a readable date. Every day count below is
 *  `number | null` because of it: NaN compares false against everything, so a
 *  guess would silently pick the safe side. */
const atMidnight = (isoDate: string): number | null => {
  const at = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(at) ? null : at
}

export function daysBetween(from: string, to: string): number | null {
  const start = atMidnight(from)
  const end = atMidnight(to)
  if (start === null || end === null) return null
  return Math.round((end - start) / MS_PER_DAY)
}

/** Positivo = atrasado, zero = hoje, negativo = ainda por vir. */
export const daysOverdue = (actionDate: string, today: string): number | null =>
  daysBetween(actionDate, today)

export const daysOpenOf = (createdAt: string, today: string): number | null =>
  daysBetween(createdAt, today)

/** `hoje`, `6d` (atrasado), `em 3d` — or `—` when the date is unreadable. */
export function formatPrazo(actionDate: string, today: string): string {
  const days = daysOverdue(actionDate, today)
  if (days === null) return '—'
  if (days === 0) return 'hoje'
  return days > 0 ? `${days}d` : `em ${-days}d`
}

export type PrazoVariant = 'alert' | 'warning' | 'neutral'

/** Deadline pill color: overdue=alert, today=warning, future=neutral. `null`
 *  when there is no action date — or when it cannot be read: an unreadable
 *  date is not a neutral deadline. Empty cell, no gray-pill noise. */
export function prazoVariant(actionDate: string | null, today: string): PrazoVariant | null {
  if (actionDate === null) return null
  const days = daysOverdue(actionDate, today)
  if (days === null) return null
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

/** `11/08/2026` — the full date, for when the year carries meaning (a filed
 *  action date, an overdue banner). Same `—` fallback as its siblings: a date
 *  that cannot be read is not a date, and reversing the parts by hand turned
 *  an unreadable one into visible garbage. */
export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = iso.slice(0, 10)
  if (Number.isNaN(Date.parse(date))) return '—'
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}

/* ── SLA contratual ────────────────────────────────────────────────────────── */

export type SlaState = 'ok' | 'warning' | 'breached'

export interface ContractualSla {
  hours: number
  hasPenalty: boolean
}

export interface SlaReading {
  /** `null` when `createdAt` is unreadable — the age is unknown. */
  daysOpen: number | null
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
  // Not knowing the age is not the same as being within the limit: reporting
  // `ok` here would announce an unmeasured ticket as safe.
  if (daysOpen === null) {
    return { daysOpen, limitHours: sla.hours, hasPenalty: sla.hasPenalty, state: null }
  }

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
