// @vitest-environment node
import { formatDateTime } from '@/lib/date'

describe('formatDateTime', () => {
  it('should format a valid ISO date as pt-BR date and time in America/Sao_Paulo', () => {
    expect(formatDateTime('2026-08-10T14:30:00.000Z')).toBe('10/08/2026, 11:30')
  })

  it('should return a dash for an invalid date', () => {
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})
