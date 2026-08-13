import { create } from 'zustand'
import type { AuthMe } from '@pipo-os/api-client'
import { client } from '@/lib/api'

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
    // non-2xx response — a 401 here just means "no session", not a failure.
    try {
      const { data } = await client.GET('/api/auth/me')
      set(
        data ? { status: 'authenticated', user: data } : { status: 'unauthenticated', user: null },
      )
    } catch {
      set({ status: 'unauthenticated', user: null })
    }
  },
  logout: async () => {
    try {
      await client.POST('/api/auth/logout')
    } finally {
      set({ status: 'unauthenticated', user: null })
    }
  },
}))
