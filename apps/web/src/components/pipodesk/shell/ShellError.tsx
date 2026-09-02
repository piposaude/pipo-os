import { useNavigate } from '@tanstack/react-router'
import { logout } from '@/lib/auth'
import { DeskError } from './DeskError'

/**
 * Fallback for a broken shell. Unlike the queue's, this one renders with no
 * sidebar — so it carries the way out of the desk itself.
 */
export function ShellError({ error, reset }: { error: Error; reset: () => void }) {
  const navigate = useNavigate()

  return (
    <DeskError
      error={error}
      reset={reset}
      onExit={() => {
        void logout()
          .catch(() => {
            // The store drops the local session anyway; leaving matters more.
          })
          .finally(() => navigate({ to: '/login' }))
      }}
    />
  )
}
