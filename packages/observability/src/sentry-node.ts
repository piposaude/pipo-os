import * as Sentry from '@sentry/node'
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

// Reporta apenas erros 5xx (não validação/erros de domínio já tratados pelo
// error-handler da aplicação). Precisa ser passado a fastifyIntegration, não a
// setupFastifyErrorHandler: no Fastify v5 o Sentry captura erros via
// diagnostics channel, e setupFastifyErrorHandler sozinho ignora esse filtro
// silenciosamente, caindo no padrão do SDK (que também reporta status <= 299).
export function shouldReportToSentry(
  _error: Error,
  _request: unknown,
  reply: { statusCode: number },
): boolean {
  return reply.statusCode >= 500
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
    integrations: [Sentry.fastifyIntegration({ shouldHandleError: shouldReportToSentry })],
  })
}

export { Sentry }
