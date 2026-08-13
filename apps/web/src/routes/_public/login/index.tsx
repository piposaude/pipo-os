import { createFileRoute, redirect } from '@tanstack/react-router'
import { ensureSession, isAuthenticated } from '@/lib/auth'
import { LoginRoute } from '@/pages/auth/login/LoginRoute'

export interface LoginSearch {
  redirect?: string
  error?: string
}

function validateSearch(search: Record<string, unknown>): LoginSearch {
  return {
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }
}

export const Route = createFileRoute('/_public/login/')({
  validateSearch,
  beforeLoad: async () => {
    await ensureSession()
    if (isAuthenticated()) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginRoute,
})
