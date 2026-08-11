import { describe, expect, it } from 'vitest'
import { shouldEnableSentry } from './env.js'

describe('shouldEnableSentry', () => {
  it('is disabled without a DSN', () => {
    expect(shouldEnableSentry({ environment: 'production' })).toBe(false)
  })

  it('is disabled in development, even with a DSN', () => {
    expect(shouldEnableSentry({ dsn: 'https://key@sentry.io/1', environment: 'development' })).toBe(
      false,
    )
  })

  it('is disabled in test, even with a DSN', () => {
    expect(shouldEnableSentry({ dsn: 'https://key@sentry.io/1', environment: 'test' })).toBe(false)
  })

  it('is enabled in staging and production when a DSN is set', () => {
    expect(shouldEnableSentry({ dsn: 'https://key@sentry.io/1', environment: 'staging' })).toBe(
      true,
    )
    expect(shouldEnableSentry({ dsn: 'https://key@sentry.io/1', environment: 'production' })).toBe(
      true,
    )
  })
})
