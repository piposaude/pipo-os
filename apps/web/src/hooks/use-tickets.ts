import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Ticket, TicketStatus } from '@pipo-os/api-client'
import { api } from '@/lib/api'

export interface CreateTicketInput {
  title: string
  description: string
}

export function useTickets() {
  const queryClient = useQueryClient()
  const ticketsQuery = api.useQuery('get', '/api/tickets')
  const createMutation = api.useMutation('post', '/api/tickets')
  const updateMutation = api.useMutation('put', '/api/tickets/{id}')
  const deleteMutation = api.useMutation('delete', '/api/tickets/{id}')
  const [actionFailed, setActionFailed] = useState(false)

  // Feature-scoped query key, derived from the same contract the query uses.
  const ticketsListKey = api.queryOptions('get', '/api/tickets').queryKey

  const setTickets = (updater: (tickets: Ticket[]) => Ticket[]) => {
    queryClient.setQueryData<Ticket[]>(ticketsListKey, (current) => updater(current ?? []))
  }

  // Mutations hydrate the cache from their response — never a refetch after
  // a write ("1 mutation = 2 requests" anti-pattern).
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
      const created = await createMutation.mutateAsync({ body: input })
      setTickets((tickets) => [...tickets, created])
    })

  const updateTicketStatus = (id: string, status: TicketStatus) =>
    runAction(async () => {
      const updated = await updateMutation.mutateAsync({
        params: { path: { id } },
        body: { status },
      })
      setTickets((tickets) => tickets.map((ticket) => (ticket.id === id ? updated : ticket)))
    })

  const deleteTicket = (id: string) =>
    runAction(async () => {
      await deleteMutation.mutateAsync({ params: { path: { id } } })
      setTickets((tickets) => tickets.filter((ticket) => ticket.id !== id))
    })

  return {
    tickets: ticketsQuery.data ?? [],
    isInitialLoading: ticketsQuery.isLoading,
    loadFailed: ticketsQuery.isError,
    actionFailed,
    dismissActionError: () => setActionFailed(false),
    isCreating: createMutation.isPending,
    createTicket,
    updateTicketStatus,
    deleteTicket,
  }
}
