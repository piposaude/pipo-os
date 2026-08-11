import { describe, expect, it } from 'vitest'
import type { ErrorEvent } from '@sentry/node'
import { initSentryNode, shouldReportToSentry, stripSensitiveHeaders } from './sentry-node.js'

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

describe('shouldReportToSentry', () => {
  const error = new Error('boom')

  it('reports 5xx responses', () => {
    expect(shouldReportToSentry(error, {}, { statusCode: 500 })).toBe(true)
    expect(shouldReportToSentry(error, {}, { statusCode: 503 })).toBe(true)
  })

  it('does not report 4xx responses', () => {
    expect(shouldReportToSentry(error, {}, { statusCode: 400 })).toBe(false)
    expect(shouldReportToSentry(error, {}, { statusCode: 404 })).toBe(false)
  })

  it('does not report successful responses', () => {
    expect(shouldReportToSentry(error, {}, { statusCode: 200 })).toBe(false)
  })
})
