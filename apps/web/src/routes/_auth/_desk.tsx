import { createFileRoute } from '@tanstack/react-router'
import { DeskShell, ShellError } from '@/components/pipodesk/shell'

/** Pathless Pipodesk layout inside `_auth` — everything here is authenticated.
 *  The boundary lives here, not only at the root of the app: a render error in
 *  one screen must not blank the whole thing. */
export const Route = createFileRoute('/_auth/_desk')({
  component: DeskShell,
  errorComponent: ShellError,
})
