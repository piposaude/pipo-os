import { createFileRoute } from '@tanstack/react-router'
import { DeskError } from '@/components/pipodesk/shell'
import QueuePage from '@/pages/pipodesk/queue'

/** The queue is the root: no screen between login and the day's work. The
 *  boundary is here as well as on the layout, so a broken queue degrades the
 *  main area and leaves the tree navigable. */
export const Route = createFileRoute('/_auth/_desk/')({
  component: QueuePage,
  errorComponent: DeskError,
})
