// Pinned to the business timezone (not the viewer's) so the same ticket shows
// the same date/time regardless of where the browser happens to be set.
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date)
}

/* The formatter only carries the timezone; the shape is assembled from the
   parts below. `format()` of any locale would do, but which order and which
   separators a locale yields is CLDR data the runtime ships — `en-CA` has
   flipped between YYYY-MM-DD and M/D/YYYY across ICU versions, and this value
   feeds string comparisons and a `\d{4}-\d{2}-\d{2}` regex. */
const businessDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const isoDayOf = (date: Date): string => {
  const parts = new Map(businessDayFormatter.formatToParts(date).map((p) => [p.type, p.value]))
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`
}

/** The São Paulo calendar day of an instant — the operation's day, not UTC's.
 *  A value that is already a day passes through untouched. */
export function businessDay(isoDate: string): string {
  if (!isoDate.includes('T')) return isoDate.slice(0, 10)
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? isoDate.slice(0, 10) : isoDayOf(date)
}

export function businessToday(): string {
  return businessDay(new Date().toISOString())
}

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function offsetAt(instant: Date): number {
  const part = new Map(wallClock.formatToParts(instant).map((p) => [p.type, p.value]))
  const n = (type: Intl.DateTimeFormatPartTypes): number => Number(part.get(type))
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/** The instant a São Paulo day starts, as ISO. Twin of `startOfBusinessDay` in
 *  api/src/shared/business-date.ts, whose cut decides when a ticket sleeps. */
export function startOfBusinessDay(isoDate: string): string {
  const utcMidnight = new Date(`${isoDate}T00:00:00Z`)
  const guess = new Date(utcMidnight.getTime() - offsetAt(utcMidnight))
  return new Date(utcMidnight.getTime() - offsetAt(guess)).toISOString()
}

export function isRealDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}
