// @vitest-environment node
import { businessDay, formatDateTime } from '@/lib/date'

describe('formatDateTime', () => {
  it('should format a valid ISO date as pt-BR date and time in America/Sao_Paulo', () => {
    expect(formatDateTime('2026-08-10T14:30:00.000Z')).toBe('10/08/2026, 11:30')
  })

  it('should return a dash for an invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})

/* The shape does not come from the locale: which order and which separators
   `format()` yields is CLDR data the runtime ships, and `en-CA` has flipped
   between YYYY-MM-DD and M/D/YYYY across ICU versions. This value feeds string
   comparisons and the `\d{4}-\d{2}-\d{2}` regex of `partsOf`, so the shape is
   assembled from the parts and pinned here. */
describe('businessDay', () => {
  it('should always yield YYYY-MM-DD, whatever the runtime locale data says', () => {
    expect(businessDay('2026-08-10T14:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(businessDay('2026-01-05T12:00:00.000Z')).toBe('2026-01-05')
  })

  it('should read an instant as its São Paulo day, not the UTC one', () => {
    // 01:30Z of the 8th is still 22:30 of the 7th in Brasília.
    expect(businessDay('2026-08-08T01:30:00.000Z')).toBe('2026-08-07')
  })

  it('should let a value that is already a day pass through', () => {
    expect(businessDay('2026-08-07')).toBe('2026-08-07')
  })
})
