import { describe, expect, it } from 'vitest'
import { businessToday } from './business-date.js'

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
