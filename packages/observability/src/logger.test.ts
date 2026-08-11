import { Writable } from 'node:stream'
import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { createLoggerOptions } from './logger.js'

function captureLogs() {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString())
      callback()
    },
  })
  return { stream, lines }
}

function lastEntry(lines: string[]) {
  return JSON.parse(lines.at(-1) ?? '{}')
}

describe('createLoggerOptions', () => {
  it('uses info level in production and debug elsewhere', () => {
    expect(createLoggerOptions({ nodeEnv: 'production' }).level).toBe('info')
    expect(createLoggerOptions({ nodeEnv: 'development' }).level).toBe('debug')
    expect(createLoggerOptions({ nodeEnv: 'test' }).level).toBe('debug')
  })

  it('only attaches the pino-pretty transport in development', () => {
    expect(createLoggerOptions({ nodeEnv: 'development' }).transport).toBeDefined()
    expect(createLoggerOptions({ nodeEnv: 'production' }).transport).toBeUndefined()
    expect(createLoggerOptions({ nodeEnv: 'test' }).transport).toBeUndefined()
  })

  it('redacts the Authorization header from request logs', () => {
    const { stream, lines } = captureLogs()
    const logger = pino(createLoggerOptions({ nodeEnv: 'test' }), stream)

    logger.info(
      {
        req: {
          method: 'GET',
          url: '/api/tickets',
          headers: {
            authorization: 'Bearer super-secret-token',
            'content-type': 'application/json',
          },
        },
      },
      'request received',
    )

    const entry = lastEntry(lines)
    expect(entry.req.headers.authorization).toBe('[REDACTED]')
    expect(entry.req.headers['content-type']).toBe('application/json')
  })

  it('redacts passwords, tokens, cpf, email, tax-id and address regardless of which object holds them', () => {
    const { stream, lines } = captureLogs()
    const logger = pino(createLoggerOptions({ nodeEnv: 'test' }), stream)

    logger.info(
      {
        user: {
          id: 'user-1',
          password: 'hunter2',
          token: 'abc123',
          cpf: '123.456.789-00',
          email: 'person@example.com',
          'tax-id': '12-3456789',
          address: 'Rua Exemplo, 123',
        },
      },
      'user updated',
    )

    const entry = lastEntry(lines)
    expect(entry.user.id).toBe('user-1')
    expect(entry.user.password).toBe('[REDACTED]')
    expect(entry.user.token).toBe('[REDACTED]')
    expect(entry.user.cpf).toBe('[REDACTED]')
    expect(entry.user.email).toBe('[REDACTED]')
    expect(entry.user['tax-id']).toBe('[REDACTED]')
    expect(entry.user.address).toBe('[REDACTED]')
  })

  it('redacts PII fields logged at the root of the log object', () => {
    const { stream, lines } = captureLogs()
    const logger = pino(createLoggerOptions({ nodeEnv: 'test' }), stream)

    logger.info(
      { ticketId: 'ticket-1', email: 'person@example.com', password: 'hunter2' },
      'ticket created',
    )

    const entry = lastEntry(lines)
    expect(entry.ticketId).toBe('ticket-1')
    expect(entry.email).toBe('[REDACTED]')
    expect(entry.password).toBe('[REDACTED]')
  })

  it('logs level as a string label instead of the raw pino number', () => {
    const { stream, lines } = captureLogs()
    const logger = pino(createLoggerOptions({ nodeEnv: 'test' }), stream)

    logger.info('ping')
    logger.error('pong')

    const [info, error] = lines.map((line) => JSON.parse(line))
    expect(info.level).toBe('info')
    expect(error.level).toBe('error')
  })

  it('omits pid but keeps hostname in the base bindings', () => {
    const { stream, lines } = captureLogs()
    const logger = pino(createLoggerOptions({ nodeEnv: 'test' }), stream)

    logger.info('ping')

    const entry = lastEntry(lines)
    expect(entry.pid).toBeUndefined()
    expect(entry.hostname).toBeDefined()
  })

  it('keeps unrelated fields untouched', () => {
    const { stream, lines } = captureLogs()
    const logger = pino(createLoggerOptions({ nodeEnv: 'test' }), stream)

    logger.info({ ticketId: 'ticket-1', status: 'open' }, 'ticket created')

    const entry = lastEntry(lines)
    expect(entry.ticketId).toBe('ticket-1')
    expect(entry.status).toBe('open')
    expect(entry.msg).toBe('ticket created')
  })
})
