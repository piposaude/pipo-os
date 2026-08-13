import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import type { Ticket } from '@pipo-os/api-client'
import { routeTree } from '@/routeTree.gen'
import { isAuthenticated } from '@/lib/auth'
import constants from '@/constants/pages/tickets/list'

vi.mock('@/lib/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn(),
}))

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const buildTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: crypto.randomUUID(),
  title: 'Erro ao gerar fatura',
  description: 'A fatura de julho não é gerada.',
  status: 'open',
  createdAt: '2026-08-10T14:30:00.000Z',
  ...overrides,
})

interface ApiRoute {
  method: string
  path: string | RegExp
  reply: (request: Request) => Response | Promise<Response>
}

describe('tickets/list', () => {
  const fetchMock = vi.fn()

  const setupApi = (routes: ApiRoute[]) => {
    fetchMock.mockImplementation(async (request: Request) => {
      const url = new URL(request.url)
      const route = routes.find(
        (candidate) =>
          candidate.method === request.method &&
          (typeof candidate.path === 'string'
            ? url.pathname === candidate.path
            : candidate.path.test(url.pathname)),
      )
      if (!route) {
        throw new Error(`Unhandled request: ${request.method} ${url.pathname}`)
      }
      return route.reply(request)
    })
  }

  const routerRender = async (url: string) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [url] }),
    })
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(isAuthenticated).mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('should redirect / to /tickets', async () => {
    setupApi([{ method: 'GET', path: '/api/tickets', reply: () => jsonResponse([]) }])

    const router = await routerRender('/')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tickets')
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: constants.title }),
    ).toBeInTheDocument()
  })

  it('should render the tickets returned by the API', async () => {
    const ticket = buildTicket()
    setupApi([{ method: 'GET', path: '/api/tickets', reply: () => jsonResponse([ticket]) }])

    await routerRender('/tickets')

    expect(await screen.findByText(ticket.title)).toBeInTheDocument()
    expect(screen.getByText(ticket.description)).toBeInTheDocument()
    // The status label appears twice: the Status badge and the (hidden)
    // change-status menu item.
    expect(screen.getAllByText(constants.status.open)).toHaveLength(2)
    expect(screen.getAllByText(constants.status.in_progress)).toHaveLength(1)
  })

  it('should not render the page when the visitor is not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    setupApi([{ method: 'GET', path: '/api/tickets', reply: () => jsonResponse([]) }])

    const router = await routerRender('/tickets')

    await waitFor(() => {
      expect(router.state.status).toBe('idle')
    })
    expect(
      screen.queryByRole('heading', { level: 1, name: constants.title }),
    ).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should show the empty state when there are no tickets', async () => {
    setupApi([{ method: 'GET', path: '/api/tickets', reply: () => jsonResponse([]) }])

    await routerRender('/tickets')

    expect(await screen.findByText(constants.empty.title)).toBeInTheDocument()
    expect(screen.getByText(constants.empty.subtitle)).toBeInTheDocument()
  })

  it('should show the load error banner when the list request fails', async () => {
    setupApi([
      {
        method: 'GET',
        path: '/api/tickets',
        reply: () => jsonResponse({ message: 'boom' }, 500),
      },
    ])

    await routerRender('/tickets')

    expect(await screen.findByText(constants.errors.load)).toBeInTheDocument()
  })

  it('should create a ticket from the form and show it in the table', async () => {
    const user = userEvent.setup()
    const created = buildTicket({ title: 'Novo chamado', description: 'Detalhes do problema' })
    setupApi([
      { method: 'GET', path: '/api/tickets', reply: () => jsonResponse([]) },
      {
        method: 'POST',
        path: '/api/tickets',
        reply: async (request) => {
          const body = (await request.json()) as { title: string; description: string }
          expect(body).toMatchObject({ title: created.title, description: created.description })
          return jsonResponse(created, 201)
        },
      },
    ])

    await routerRender('/tickets')
    await screen.findByText(constants.empty.title)

    await user.type(screen.getByLabelText(new RegExp(constants.form.titleLabel)), created.title)
    await user.type(
      screen.getByLabelText(new RegExp(constants.form.descriptionLabel)),
      created.description,
    )
    await user.click(screen.getByRole('button', { name: constants.form.submit }))

    expect(await screen.findByText(created.title)).toBeInTheDocument()
    expect(screen.queryByText(constants.empty.title)).not.toBeInTheDocument()
  })

  it('should update the ticket status through the actions menu', async () => {
    const user = userEvent.setup()
    const ticket = buildTicket()
    const updated = { ...ticket, status: 'in_progress' as const }
    setupApi([
      { method: 'GET', path: '/api/tickets', reply: () => jsonResponse([ticket]) },
      {
        method: 'PUT',
        path: new RegExp(`^/api/tickets/${ticket.id}$`),
        reply: () => jsonResponse(updated),
      },
    ])

    await routerRender('/tickets')
    await screen.findByText(ticket.title)

    await user.click(screen.getByRole('button', { name: constants.actions.changeStatus }))
    await user.click(screen.getByRole('menuitem', { name: constants.status.in_progress }))

    // Badge + (closed, hidden) menu item once the badge switches to the new
    // status; the old status remains only as a (re-enabled) menu item.
    await waitFor(() => {
      expect(screen.getAllByText(constants.status.in_progress)).toHaveLength(2)
    })
    expect(screen.getAllByText(constants.status.open)).toHaveLength(1)

    // Reopening confirms the menu closed after the selection and that the
    // new current status is now the disabled option.
    await user.click(screen.getByRole('button', { name: constants.actions.changeStatus }))
    expect(screen.getByRole('menuitem', { name: constants.status.in_progress })).toBeDisabled()
  })

  it('should remove the ticket from the table when deletion succeeds', async () => {
    const user = userEvent.setup()
    const ticket = buildTicket()
    setupApi([
      { method: 'GET', path: '/api/tickets', reply: () => jsonResponse([ticket]) },
      {
        method: 'DELETE',
        path: new RegExp(`^/api/tickets/${ticket.id}$`),
        reply: () => new Response(null, { status: 204 }),
      },
    ])

    await routerRender('/tickets')
    await screen.findByText(ticket.title)

    await user.click(screen.getByRole('button', { name: constants.actions.delete }))

    await waitFor(() => {
      expect(screen.queryByText(ticket.title)).not.toBeInTheDocument()
    })
    expect(await screen.findByText(constants.empty.title)).toBeInTheDocument()
  })
})
