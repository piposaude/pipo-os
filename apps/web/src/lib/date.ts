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

/** `en-CA` because it formats as YYYY-MM-DD, the shape every date cut compares. */
const businessDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The São Paulo calendar day of an instant — the operation's day, not UTC's.
 *  A value that is already a day passes through untouched. */
export function businessDay(isoDate: string): string {
  if (!isoDate.includes('T')) return isoDate.slice(0, 10)
  const date = new Date(isoDate)
  return Number.isNaN(date.getTime()) ? isoDate.slice(0, 10) : businessDayFormatter.format(date)
}
