import * as Sentry from '@sentry/react'
import { shouldEnableSentry } from './env.js'

export interface InitSentryReactOptions {
  dsn?: string
  environment: string
  enabled?: boolean
}

export function initSentryReact(options: InitSentryReactOptions): void {
  const { dsn, environment } = options
  const enabled = options.enabled ?? shouldEnableSentry({ dsn, environment })

  if (!enabled) {
    return
  }

  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
  })
}

export const SentryErrorBoundary = Sentry.ErrorBoundary

/** For boundaries that catch below `SentryErrorBoundary` (a route's
 *  `errorComponent`): without reporting by hand, the error is handled and
 *  never reaches Sentry. No-op when Sentry was not initialized. */
export const captureException = Sentry.captureException
