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
  displayNumber: 'M000001',
  title: null,
  enrollmentId: crypto.randomUUID(),
  enrollmentType: 'inclusion',
  status: 'broker-processing',
  priority: null,
  actionDate: null,
  queueId: null,
  groupId: null,
  assigneeId: null,
  companyId: crypto.randomUUID(),
  tags: [],
  pendingDocumentation: [],
  requester: null,
  collaborators: [],
  forceCompletion: false,
  enrollmentSnapshot: {},
  sourceSystem: 'enrollment-integrations',
  parentTicketId: null,
  closedAt: null,
  createdAt: '2026-08-10T14:30:00.000Z',
  updatedAt: '2026-08-10T14:30:00.000Z',
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
    const router = await routerRender('/')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/tickets')
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: constants.title }),
    ).toBeInTheDocument()
  })

  it('should not render the page when the visitor is not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)

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
    await routerRender('/tickets')

    expect(await screen.findByText(constants.empty.title)).toBeInTheDocument()
    expect(screen.getByText(constants.empty.subtitle)).toBeInTheDocument()
  })

  it('should create a ticket from the form and show it in the table', async () => {
    const user = userEvent.setup()
    const created = buildTicket({ enrollmentType: 'Novo chamado' })
    setupApi([
      {
        method: 'POST',
        path: '/api/tickets',
        reply: async (request) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body).toMatchObject({ enrollmentType: created.enrollmentType })
          return jsonResponse(created, 201)
        },
      },
    ])

    await routerRender('/tickets')
    await screen.findByText(constants.empty.title)

    await user.type(
      screen.getByLabelText(new RegExp(constants.form.titleLabel)),
      created.enrollmentType,
    )
    await user.type(
      screen.getByLabelText(new RegExp(constants.form.descriptionLabel)),
      'Detalhes do problema',
    )
    await user.click(screen.getByRole('button', { name: constants.form.submit }))

    expect(await screen.findByText(created.enrollmentType)).toBeInTheDocument()
    expect(screen.queryByText(constants.empty.title)).not.toBeInTheDocument()
  })

  it('should render the tickets returned by the API', async () => {
    const ticket = buildTicket()
    setupApi([
      {
        method: 'POST',
        path: '/api/tickets',
        reply: async (request) => {
          const body = (await request.json()) as Record<string, unknown>
          expect(body).toMatchObject({
            sourceSystem: 'web',
            enrollmentSnapshot: { description: ticket.sourceSystem },
          })
          return jsonResponse(ticket, 201)
        },
      },
    ])

    await routerRender('/tickets')
    await screen.findByText(constants.empty.title)

    const user = userEvent.setup()
    await user.type(
      screen.getByLabelText(new RegExp(constants.form.titleLabel)),
      ticket.enrollmentType,
    )
    await user.type(
      screen.getByLabelText(new RegExp(constants.form.descriptionLabel)),
      ticket.sourceSystem,
    )
    await user.click(screen.getByRole('button', { name: constants.form.submit }))

    expect(await screen.findByText(ticket.enrollmentType)).toBeInTheDocument()
    expect(screen.getByText(ticket.sourceSystem)).toBeInTheDocument()
  })
})
