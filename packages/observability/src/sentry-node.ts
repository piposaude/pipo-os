import * as Sentry from '@sentry/node'
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { shouldEnableSentry } from './env.js'

export interface InitSentryNodeOptions {
  dsn?: string
  environment?: string
  enabled?: boolean
}

export function stripSensitiveHeaders(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const headers = event.request?.headers
  if (headers) {
    delete headers.authorization
    delete headers.Authorization
    delete headers.cookie
    delete headers.Cookie
  }
  return event
}

export function initSentryNode(options: InitSentryNodeOptions = {}): void {
  const environment =
    options.environment ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development'
  const dsn = options.dsn ?? process.env.SENTRY_DSN
  const enabled = options.enabled ?? shouldEnableSentry({ dsn, environment })

  if (!enabled) {
    return
  }

  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
    beforeSend: stripSensitiveHeaders,
  })
}

// Reporta apenas erros 5xx (não validação/erros de domínio já tratados pelo
// error-handler da aplicação) com contexto de request, sem PII.
export default fp(
  async function observabilitySentry(app: FastifyInstance) {
    Sentry.setupFastifyErrorHandler(app, {
      shouldHandleError(_error, _request, reply) {
        return reply.statusCode >= 500
      },
    })
  },
  { name: 'observability-sentry' },
)

export { Sentry }
