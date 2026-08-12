// @vitest-environment node
import { formatDateTime } from '@/lib/date'

describe('formatDateTime', () => {
  it('should format a valid ISO date as pt-BR date and time', () => {
    expect(formatDateTime('2026-08-10T14:30:00.000Z')).toMatch(
      /^\d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/,
    )
  })

  it('should return a dash for an invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})
