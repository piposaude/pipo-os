// Single place route guards read auth state from, and the entrypoint for the
// logout action. Session data itself lives in the Zustand store — this module
// only adds the single-flight hydration route guards need before checking it.
import { useSessionStore } from '@/stores/session'

let pendingLoad: Promise<void> | null = null

// Hydrates the session (GET /api/auth/me) at most once per app load. Safe to
// call from every _auth/_public beforeLoad — concurrent callers share the
// same in-flight request instead of triggering one each.
export function ensureSession(): Promise<void> {
  const { status, load } = useSessionStore.getState()
  if (status === 'authenticated' || status === 'unauthenticated') {
    return Promise.resolve()
  }
  pendingLoad ??= load().finally(() => {
    pendingLoad = null
  })
  return pendingLoad
}

export function isAuthenticated(): boolean {
  return useSessionStore.getState().status === 'authenticated'
}

/** What `/api/auth/me` returned for this session, for a guard to weigh against
 *  what a route requires. Empty without a session — a guard that reaches this
 *  before `isAuthenticated()` should refuse, not admit. */
export function sessionPolicies(): string[] {
  return useSessionStore.getState().user?.policies ?? []
}

export function logout(): Promise<void> {
  return useSessionStore.getState().logout()
}
