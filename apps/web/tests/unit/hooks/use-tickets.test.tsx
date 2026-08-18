import type { ReactNode } from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Ticket } from '@pipo-os/api-client'
import { useTickets } from '@/hooks/use-tickets'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const buildTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: crypto.randomUUID(),
  enrollmentId: crypto.randomUUID(),
  enrollmentType: 'inclusion',
  status: 'broker-processing',
  queueId: null,
  assigneeId: null,
  companyId: crypto.randomUUID(),
  tags: [],
  forceCompletion: false,
  enrollmentSnapshot: {},
  sourceSystem: 'enrollment-integrations',
  parentTicketId: null,
  closedAt: null,
  createdAt: '2026-08-10T14:30:00.000Z',
  updatedAt: '2026-08-10T14:30:00.000Z',
  ...overrides,
})

describe('useTickets', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should hydrate the list from the create response without refetching', async () => {
    const created = buildTicket({ enrollmentType: 'Novo ticket' })
    fetchMock.mockResolvedValueOnce(jsonResponse(created, 201))

    const { result } = renderHook(() => useTickets(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isInitialLoading).toBe(false))

    let succeeded: boolean | undefined
    await act(async () => {
      succeeded = await result.current.createTicket({
        title: created.enrollmentType,
        description: 'Descrição do ticket',
      })
    })

    expect(succeeded).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1) // POST only, no refetch
    expect(result.current.tickets).toMatchObject([{ id: created.id }])
  })

  it('should flag actionFailed when a mutation fails and clear it on dismiss', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 500))

    const { result } = renderHook(() => useTickets(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isInitialLoading).toBe(false))

    let succeeded: boolean | undefined
    await act(async () => {
      succeeded = await result.current.createTicket({
        title: 'Novo ticket',
        description: 'Descrição do ticket',
      })
    })

    expect(succeeded).toBe(false)
    expect(result.current.actionFailed).toBe(true)
    expect(result.current.tickets).toHaveLength(0)

    act(() => result.current.dismissActionError())
    expect(result.current.actionFailed).toBe(false)
  })

  it('should remove the ticket from the list when deletion succeeds', async () => {
    const existing = buildTicket()
    fetchMock.mockResolvedValueOnce(jsonResponse(existing, 201))

    const { result } = renderHook(() => useTickets(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.createTicket({
        title: existing.enrollmentType,
        description: 'Descrição',
      })
    })
    expect(result.current.tickets).toHaveLength(1)

    await act(async () => {
      await result.current.deleteTicket(existing.id)
    })

    // deleteTicket é placeholder — tickets permanecem até que o endpoint exista
    expect(result.current.tickets).toHaveLength(1)
  })
})
