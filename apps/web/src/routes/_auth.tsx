import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { ensureSession, isAuthenticated } from '@/lib/auth'

// Pathless layout guarding every protected route: hydrates the session once
// (GET /api/auth/me, deduped by ensureSession) and redirects to the public
// login route — preserving the destination — when there's no active session.
export const Route = createFileRoute('/_auth')({
  beforeLoad: async ({ location }) => {
    await ensureSession()
    if (!isAuthenticated()) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  // No top bar: the shell carries identity in the sidebar footer, like the
  // prototype. A platform bar would stack two brands and cost 56px of queue.
  component: Outlet,
})
