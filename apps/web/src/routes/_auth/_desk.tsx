import { createFileRoute } from '@tanstack/react-router'
import { DeskShell } from '@/components/pipodesk/shell'

/** Pathless Pipodesk layout inside `_auth` — everything here is authenticated. */
export const Route = createFileRoute('/_auth/_desk')({
  component: DeskShell,
})
