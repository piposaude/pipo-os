// @vitest-environment node
import {
  BLOCKED_BY,
  FEATURES,
  isEnabled,
  pendingHint,
  type FeatureFlag,
} from '@/lib/pipodesk/features'

describe('FEATURES', () => {
  it('should start with every capability off, since none of them has a backend yet', () => {
    for (const [flag, enabled] of Object.entries(FEATURES)) {
      expect(enabled, `${flag} should start off`).toBe(false)
    }
  })

  it('should cover the capabilities the front-first track parks behind a placeholder', () => {
    const expected: FeatureFlag[] = [
      'timeline',
      'formValues',
      'gates',
      'priority',
      'schedule',
      'batch',
      'search',
      'inbox',
      'favorites',
      'users',
      'members',
      'portfolio',
    ]

    expect(Object.keys(FEATURES).sort()).toEqual([...expected].sort())
  })

  it('should name the ticket that turns each flag on, so a disabled control can explain itself', () => {
    for (const flag of Object.keys(FEATURES) as FeatureFlag[]) {
      expect(BLOCKED_BY[flag], `${flag} should name a blocking ticket`).toMatch(/^PD-\d{3}/)
    }
  })
})

describe('isEnabled', () => {
  it('should report a flag as off while it is off', () => {
    expect(isEnabled('timeline')).toBe(false)
  })
})

describe('pendingHint', () => {
  it('should build the tooltip of a disabled control naming what it waits for', () => {
    expect(pendingHint('batch')).toBe('Em breve — depende de PD-042 (lote na API)')
  })
})
