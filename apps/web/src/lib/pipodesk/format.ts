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

/**
 * The three parts of an ISO date, or `null` when the string is not one. The
 * SHAPE is checked, not only whether `Date.parse` accepts it: both readers
 * below split on `-` and print the parts by position, so `11/08/2026` — a
 * real date the parser takes — split into a single part and printed
 * `undefined/undefined/11/08/2026`. `Date.parse` still runs, and is what
 * rejects an out-of-range part (`2026-13-01`, `2026-01-32`). It does NOT
 * reject `2026-02-30` — it rolls that into March — but the parts are printed
 * as given, never re-read off the parsed date, so a filed date shows what was
 * filed instead of silently moving a day.
 *
 * `atMidnight` above needs no such guard: it appends `T00:00:00Z` before
 * parsing, which is already unparseable for anything but this shape.
 */
const partsOf = (iso: string | null): { year: string; month: string; day: string } | null => {
  if (!iso) return null
  const date = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return null
  const [year, month, day] = date.split('-')
  return { year, month, day }
}

/** `11/08`, or `03/12/25` when the year differs — never silently dropped. */
export function formatDayMonth(iso: string | null, today: string): string {
  const parts = partsOf(iso)
  if (parts === null) return '—'
  const { year, month, day } = parts
  return year === today.slice(0, 4) ? `${day}/${month}` : `${day}/${month}/${year.slice(2)}`
}

/** `11/08/2026` — the full date, for when the year carries meaning (a filed
 *  action date, an overdue banner). */
export function formatDate(iso: string | null): string {
  const parts = partsOf(iso)
  if (parts === null) return '—'
  return `${parts.day}/${parts.month}/${parts.year}`
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
