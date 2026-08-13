import { create } from 'zustand'
import type { AuthMe } from '@pipo-os/api-client'
import { client } from '@/lib/api'
import { ApiError } from '@/lib/api/errors'

export type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated'

interface SessionState {
  status: SessionStatus
  user: AuthMe | null
  load: () => Promise<void>
  logout: () => Promise<void>
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'idle',
  user: null,
  load: async () => {
    set({ status: 'loading' })
    // The shared client middleware (lib/api/client.ts) throws ApiError on any
    // non-2xx response — a confirmed 401 means "no session". Anything else
    // (network failure, 5xx, a hung request) is unknown, not "logged out": we
    // fall back to idle so a later ensureSession() retries instead of
    // permanently locking a valid visitor out until a full page reload.
    try {
      const { data } = await client.GET('/api/auth/me')
      set(data ? { status: 'authenticated', user: data } : { status: 'idle', user: null })
    } catch (error) {
      const isUnauthenticated = error instanceof ApiError && error.status === 401
      set({ status: isUnauthenticated ? 'unauthenticated' : 'idle', user: null })
    }
  },
  logout: async () => {
    try {
      await client.POST('/api/auth/logout')
    } catch {
      // Best-effort: the user asked to log out, so drop the local session
      // below regardless — the auth-service has no revoke endpoint to
      // reconcile with anyway (see the comment on POST /api/auth/logout in
      // apps/api/src/modules/auth/routes.ts).
    } finally {
      set({ status: 'unauthenticated', user: null })
    }
  },
}))
