import { createFileRoute, redirect } from '@tanstack/react-router'
import { DeskShell, ShellError } from '@/components/pipodesk/shell'
import { hasDeskAccess } from '@/lib/policy'
import { sessionPolicies } from '@/lib/auth'

/** Pathless Pipodesk layout inside `_auth` — everything here is authenticated.
 *  The boundary lives here, not only at the root of the app: a render error in
 *  one screen must not blank the whole thing. */
export const Route = createFileRoute('/_auth/_desk')({
  // A session is not an authorization: every Pipo e-mail gets one. Without the
  // policy the shell mounts and every request behind it answers 403.
  beforeLoad: () => {
    if (!hasDeskAccess(sessionPolicies())) {
      throw redirect({ to: '/no-access' })
    }
  },
  component: DeskShell,
  errorComponent: ShellError,
})
