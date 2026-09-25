import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/_desk/tickets/$id')({
  component: lazyRouteComponent(() => import('@/pages/pipodesk/ticket')),
})
