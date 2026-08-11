import { describe, expect, it } from 'vitest'
import type { ErrorEvent } from '@sentry/node'
import { initSentryNode, stripSensitiveHeaders } from './sentry-node.js'

describe('stripSensitiveHeaders', () => {
  it('removes authorization and cookie headers from the event request context', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'session=abc',
          'content-type': 'application/json',
        },
      },
    }

    const result = stripSensitiveHeaders(event)

    expect(result.request?.headers?.authorization).toBeUndefined()
    expect(result.request?.headers?.cookie).toBeUndefined()
    expect(result.request?.headers?.['content-type']).toBe('application/json')
  })

  it('is a no-op when the event has no request headers', () => {
    const event: ErrorEvent = { type: undefined }
    expect(stripSensitiveHeaders(event)).toBe(event)
  })
})

describe('initSentryNode', () => {
  it('does not throw when disabled (no DSN, dev/test environment)', () => {
    expect(() => initSentryNode({ environment: 'test' })).not.toThrow()
    expect(() => initSentryNode({ environment: 'development' })).not.toThrow()
  })
})
