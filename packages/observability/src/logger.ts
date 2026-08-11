import { createRequire } from 'node:module'
import pino, { type LoggerOptions } from 'pino'
import { PII_REDACT_PATHS } from './redact.js'

const require = createRequire(import.meta.url)

interface RequestLike {
  method: string
  url: string
  hostname?: string
  ip?: string
  headers: Record<string, unknown>
}

interface ReplyLike {
  statusCode: number
}

function requestSerializer(request: RequestLike) {
  return {
    method: request.method,
    url: request.url,
    hostname: request.hostname,
    remoteAddress: request.ip,
    headers: request.headers,
  }
}

function responseSerializer(reply: ReplyLike) {
  return { statusCode: reply.statusCode }
}

export interface CreateLoggerOptionsInput {
  level?: string
  nodeEnv?: string
  additionalRedactPaths?: readonly string[]
}

export function createLoggerOptions(input: CreateLoggerOptionsInput = {}): LoggerOptions {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? 'development'
  const level =
    input.level ?? process.env.LOG_LEVEL ?? (nodeEnv === 'production' ? 'info' : 'debug')

  const options: LoggerOptions = {
    level,
    redact: {
      paths: [...PII_REDACT_PATHS, ...(input.additionalRedactPaths ?? [])],
      censor: '[REDACTED]',
    },
    serializers: {
      req: requestSerializer,
      res: responseSerializer,
      err: pino.stdSerializers.err,
    },
  }

  // require.resolve garante que o worker do transport ache pino-pretty mesmo com
  // node_modules estrito do pnpm, independente de onde o app consumidor roda.
  if (nodeEnv === 'development') {
    options.transport = {
      target: require.resolve('pino-pretty'),
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    }
  }

  return options
}
