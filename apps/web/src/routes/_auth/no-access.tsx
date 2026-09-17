import { createFileRoute, redirect } from '@tanstack/react-router'
import { hasDeskAccess } from '@/lib/policy'
import { sessionPolicies } from '@/lib/auth'
import NoAccessPage from '@/pages/auth/no-access'

/** Inside `_auth` (so it still needs a session) and outside `_desk` (so it
 *  never renders the sidebar of a desk this visitor cannot open). */
export const Route = createFileRoute('/_auth/no-access')({
  // Telling someone they have no access when they do is as wrong as the shell
  // that breaks on 403 — the mirror of the redirect /login already does.
  beforeLoad: () => {
    if (hasDeskAccess(sessionPolicies())) {
      throw redirect({ to: '/' })
    }
  },
  component: NoAccessPage,
})
