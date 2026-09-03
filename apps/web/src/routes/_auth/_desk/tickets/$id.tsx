import { createFileRoute } from '@tanstack/react-router'
import TicketPage from '@/pages/pipodesk/ticket'

export const Route = createFileRoute('/_auth/_desk/tickets/$id')({
  component: TicketPage,
})
