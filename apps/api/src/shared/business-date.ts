/** The operation's day, not the server's. `en-CA` because it formats as
 *  YYYY-MM-DD, the shape every date cut in the filter compares against. */
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function businessToday(now: Date = new Date()): string {
  return formatter.format(now)
}
