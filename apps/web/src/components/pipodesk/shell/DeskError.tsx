import { useEffect } from 'react'
import { Button } from '@piposaude/design-system'
import { captureException } from '@pipo-os/observability/sentry-react'
import constants from '@/constants/pipodesk/error'
import styles from './DeskError.module.css'

/** Every desk preference shares this prefix — recovery is not a reset button
 *  for the whole origin. */
const PREFIX = 'pipodesk:'

/** Iterates through the Storage API, not `Object.keys`: keys are collected
 *  first because removing shifts the indexes. */
function dropDeskPreferences(): void {
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // No storage in this environment: nothing to drop.
  }
}

export interface DeskErrorProps {
  error: Error
  reset: () => void
  /** Set on the layout fallback only: there the sidebar is gone with the
   *  shell, so this is the only way out of the desk. */
  onExit?: () => void
}

/**
 * Fallback for the desk routes. It exists so a broken screen degrades one
 * region instead of blanking the app, and so the way out is an action and not
 * a reload — a reload reads the same stored preference back.
 */
export function DeskError({ error, reset, onExit }: DeskErrorProps) {
  // This boundary sits below `SentryErrorBoundary`, which no longer sees the
  // error: handling it here would otherwise make it disappear from Sentry.
  useEffect(() => {
    captureException(error)
  }, [error])

  return (
    <div className={styles.screen} role="alert">
      <h1 className={styles.title}>{constants.title}</h1>
      <p className={styles.body}>{constants.body}</p>
      <Button
        variant="primary"
        onClick={() => {
          dropDeskPreferences()
          reset()
        }}
      >
        {constants.retry}
      </Button>
      <p className={styles.hint}>{constants.retryHint}</p>
      {onExit && (
        <Button variant="secondary" onClick={onExit}>
          {constants.exit}
        </Button>
      )}
      <pre className={styles.detail}>{error.message}</pre>
    </div>
  )
}
