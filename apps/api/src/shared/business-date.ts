/** The operation's timezone. Every "day" a business rule reads — today, the
 *  day a ticket is due, the day it was created — is read here, whatever
 *  instant the column holds. Storage and transport stay UTC. */
export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

/** `en-CA` because it formats as YYYY-MM-DD, the shape every date cut in the
 *  filter compares against. */
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The operation's day, not the server's. */
export function businessToday(now: Date = new Date()): string {
  return dayFormatter.format(now)
}

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Offset of the business timezone at `instant`, in ms; negative west of UTC. */
function offsetAt(instant: Date): number {
  const part = new Map(wallClock.formatToParts(instant).map((p) => [p.type, p.value]))
  const n = (type: Intl.DateTimeFormatPartTypes): number => Number(part.get(type))
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'))
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/** The instant a business day starts, as ISO. A bare timestamptz column
 *  compared against it keeps its index, where a `::date` cast would lose it
 *  and read the day in the session's zone besides. Solved from the offset in
 *  force at that midnight, so a DST change, should Brazil bring it back, still
 *  lands on the right instant. */
export function startOfBusinessDay(isoDate: string): string {
  const utcMidnight = new Date(`${isoDate}T00:00:00Z`)
  const guess = new Date(utcMidnight.getTime() - offsetAt(utcMidnight))
  return new Date(utcMidnight.getTime() - offsetAt(guess)).toISOString()
}
