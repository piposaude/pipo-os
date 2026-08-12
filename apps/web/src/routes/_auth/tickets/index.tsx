import { createFileRoute } from '@tanstack/react-router'
import TicketsList from '@/pages/tickets/list'

export const Route = createFileRoute('/_auth/tickets/')({
  component: TicketsList,
})
