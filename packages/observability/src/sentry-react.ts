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
