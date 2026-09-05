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
