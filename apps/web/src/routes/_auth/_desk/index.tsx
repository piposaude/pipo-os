import { createFileRoute } from '@tanstack/react-router'
import QueuePage from '@/pages/pipodesk/queue'

/** The queue is the root: no screen between login and the day's work. */
export const Route = createFileRoute('/_auth/_desk/')({
  component: QueuePage,
})
