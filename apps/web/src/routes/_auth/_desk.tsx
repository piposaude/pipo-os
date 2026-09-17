import { createFileRoute, redirect } from '@tanstack/react-router'
import { DeskShell, ShellError } from '@/components/pipodesk/shell'
import { hasDeskAccess } from '@/lib/policy'
import { sessionPolicies } from '@/lib/auth'

/** Pathless Pipodesk layout inside `_auth` — everything here is authenticated.
 *  The boundary lives here, not only at the root of the app: a render error in
 *  one screen must not blank the whole thing. */
export const Route = createFileRoute('/_auth/_desk')({
  // A session is not an authorisation: every Pipo e-mail reaches one, and the
  // policy is what the API requires. Without this the shell mounts and every
  // request behind it answers 403, which reads as a broken screen.
  beforeLoad: () => {
    if (!hasDeskAccess(sessionPolicies())) {
      throw redirect({ to: '/no-access' })
    }
  },
  component: DeskShell,
  errorComponent: ShellError,
})
