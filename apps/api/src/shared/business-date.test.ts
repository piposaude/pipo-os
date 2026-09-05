import { describe, expect, it } from 'vitest'
import { businessToday, startOfBusinessDay } from './business-date.js'

describe('businessToday', () => {
  /** The hours that made this function necessary: in UTC it is already the next
   *  day, and the awake window would open a day wider than the queue shows. */
  it('is still the day before at 22:00 in São Paulo, though UTC has turned', () => {
    const at22 = new Date('2026-09-03T01:00:00.000Z')

    expect(at22.toISOString().slice(0, 10)).toBe('2026-09-03')
    expect(businessToday(at22)).toBe('2026-09-02')
  })

  it('turns the day when São Paulo does, not before', () => {
    expect(businessToday(new Date('2026-09-04T02:59:00.000Z'))).toBe('2026-09-03')
    expect(businessToday(new Date('2026-09-04T03:01:00.000Z'))).toBe('2026-09-04')
  })

  it('agrees with UTC in the middle of the working day', () => {
    expect(businessToday(new Date('2026-09-03T15:00:00.000Z'))).toBe('2026-09-03')
  })
})

describe('startOfBusinessDay', () => {
  it('is the instant midnight strikes in São Paulo, three hours after UTC', () => {
    expect(startOfBusinessDay('2026-09-03')).toBe('2026-09-03T03:00:00.000Z')
  })

  it('puts 01:30Z on the day before, and 03:00Z on the day itself', () => {
    const cut = Date.parse(startOfBusinessDay('2026-09-03'))

    expect(Date.parse('2026-09-03T01:30:00.000Z') < cut).toBe(true)
    expect(Date.parse('2026-09-03T03:00:00.000Z') < cut).toBe(false)
  })
})

/* The shape does not come from the locale: which order and which separators
   `format()` yields is CLDR data the runtime ships, and `en-CA` has flipped
   between YYYY-MM-DD and M/D/YYYY across ICU versions. Every date cut in the
   filter compares this value as a string, so the shape is assembled from the
   parts and pinned here. */
describe('businessToday shape', () => {
  it('always yields YYYY-MM-DD, whatever the runtime locale data says', () => {
    expect(businessToday(new Date('2026-08-07T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(businessToday(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05')
  })
})
