import { createFileRoute, redirect } from '@tanstack/react-router'
import { hasDeskAccess } from '@/lib/policy'
import { sessionPolicies } from '@/lib/auth'
import NoAccessPage from '@/pages/auth/no-access'

/** Inside `_auth` (still needs a session) and outside `_desk` (never renders
 *  the desk shell). */
export const Route = createFileRoute('/_auth/no-access')({
  // Mirror of the /login redirect: telling someone they have no access when
  // they do is as wrong as the shell that breaks on 403.
  beforeLoad: () => {
    if (hasDeskAccess(sessionPolicies())) {
      throw redirect({ to: '/' })
    }
  },
  component: NoAccessPage,
})
