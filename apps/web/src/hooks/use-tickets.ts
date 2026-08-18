import { useState } from 'react'
import type { Ticket, TicketStatus } from '@pipo-os/api-client'
import { api } from '@/lib/api'

export interface CreateTicketInput {
  title: string
  description: string
}

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [actionFailed, setActionFailed] = useState(false)
  const createMutation = api.useMutation('post', '/api/tickets')

  const runAction = async (action: () => Promise<void>): Promise<boolean> => {
    try {
      setActionFailed(false)
      await action()
      return true
    } catch {
      setActionFailed(true)
      return false
    }
  }

  const createTicket = (input: CreateTicketInput) =>
    runAction(async () => {
      const created = await createMutation.mutateAsync({
        body: {
          enrollmentId: crypto.randomUUID(),
          enrollmentType: input.title,
          companyId: crypto.randomUUID(),
          sourceSystem: 'web',
          enrollmentSnapshot: { description: input.description },
        },
      })
      setTickets((prev) => [...prev, created])
    })

  // Placeholders — endpoints serão implementados no ACE-53
  const updateTicketStatus: (id: string, status: TicketStatus) => Promise<boolean> = () =>
    runAction(async () => {})

  const deleteTicket: (id: string) => Promise<boolean> = () => runAction(async () => {})

  return {
    tickets,
    isInitialLoading: false,
    loadFailed: false,
    actionFailed,
    dismissActionError: () => setActionFailed(false),
    isCreating: createMutation.isPending,
    createTicket,
    updateTicketStatus,
    deleteTicket,
  }
}
