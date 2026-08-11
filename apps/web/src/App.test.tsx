import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const { useQueryMock, useMutationMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
}))

vi.mock('./lib/api', () => ({
  api: {
    useQuery: (...args: unknown[]) => useQueryMock(...args),
    useMutation: (...args: unknown[]) => useMutationMock(...args),
    queryOptions: () => ({ queryKey: ['get', '/api/tickets'] }),
  },
}))

function renderApp() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useMutationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
})

describe('App', () => {
  it('shows a loading state while tickets are being fetched', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null })

    renderApp()

    expect(screen.getByText('Loading tickets...')).toBeDefined()
  })

  it('shows an empty state when there are no tickets', () => {
    useQueryMock.mockReturnValue({ data: [], isLoading: false, isError: false, error: null })

    renderApp()

    expect(screen.getByText('No tickets yet. Create one above.')).toBeDefined()
  })

  it('shows the query error in the error banner', () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Failed to fetch tickets' },
    })

    renderApp()

    expect(screen.getByText('Failed to fetch tickets')).toBeDefined()
  })
})
