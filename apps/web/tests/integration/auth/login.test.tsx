import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import loginConstants from '@/constants/pages/auth/login'
import devConstants from '@/constants/pages/auth/login/dev'
import sidebarConstants from '@/constants/pipodesk/sidebar'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

interface ApiRoute {
  method: string
  path: string | RegExp
  reply: (input: Request | string, init?: RequestInit) => Response | Promise<Response>
}

describe('auth/login', () => {
  const fetchMock = vi.fn()

  // Handles both call shapes the app produces: the generated client passes a
  // Request object, while the dev-login helper calls fetch(url, init) with a
  // relative string. Matching only Request objects would make dev-login
  // requests throw here and mask the behaviour under test.
  const setupApi = (routes: ApiRoute[]) => {
    fetchMock.mockImplementation(async (input: Request | string, init?: RequestInit) => {
      const rawUrl = typeof input === 'string' ? input : input.url
      const method = (typeof input === 'string' ? init?.method : input.method) ?? 'GET'
      const url = new URL(rawUrl, 'http://localhost')
      const route = routes.find(
        (candidate) =>
          candidate.method === method &&
          (typeof candidate.path === 'string'
            ? url.pathname === candidate.path
            : candidate.path.test(url.pathname)),
      )
      if (!route) {
        throw new Error(`Unhandled request: ${method} ${url.pathname}`)
      }
      return route.reply(input, init)
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
    useSessionStore.setState({ status: 'idle', user: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('redirects an unauthenticated visitor from a protected route to /login, preserving the destination', async () => {
    setupApi([{ method: 'GET', path: '/api/auth/me', reply: () => jsonResponse({}, 401) }])

    const router = await routerRender('/')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
    expect(router.state.location.search).toEqual({ redirect: '/' })
    expect(
      await screen.findByRole('button', { name: loginConstants.googleButton }),
    ).toBeInTheDocument()
  })

  it('points the Google button at /api/auth/google with the preserved redirect', async () => {
    setupApi([{ method: 'GET', path: '/api/auth/me', reply: () => jsonResponse({}, 401) }])
    // jsdom's window.location.assign is non-configurable, so it can't be
    // spied on directly — stub the whole global instead.
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })

    await routerRender('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: loginConstants.googleButton }))

    expect(assign).toHaveBeenCalledWith('/api/auth/google?redirect=%2F')
  })

  // Vitest runs with import.meta.env.DEV true, so the dev-only button renders
  // here exactly as it does under `pnpm dev`. Its absence from the production
  // bundle is enforced at build time by Vite, not by this suite.
  it('signs in through the dev-login button and lands on the preserved destination', async () => {
    setupApi([
      { method: 'GET', path: '/api/auth/me', reply: () => jsonResponse({}, 401) },
      {
        method: 'POST',
        path: '/api/auth/dev-login',
        reply: () => new Response(null, { status: 204 }),
      },
    ])
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })

    await routerRender('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: devConstants.button }))

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/')
    })
  })

  it('warns when the dev-login endpoint is unavailable', async () => {
    setupApi([
      { method: 'GET', path: '/api/auth/me', reply: () => jsonResponse({}, 401) },
      {
        method: 'POST',
        path: '/api/auth/dev-login',
        reply: () => new Response(null, { status: 404 }),
      },
    ])

    await routerRender('/login')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: devConstants.button }))

    expect(await screen.findByText(devConstants.unavailable)).toBeInTheDocument()
  })

  it('shows the mapped error message for a known error code', async () => {
    setupApi([{ method: 'GET', path: '/api/auth/me', reply: () => jsonResponse({}, 401) }])

    await routerRender('/login?error=domain_not_allowed')

    expect(await screen.findByText(loginConstants.errors.domain_not_allowed)).toBeInTheDocument()
  })

  it('redirects an already-authenticated visitor away from /login', async () => {
    setupApi([
      {
        method: 'GET',
        path: '/api/auth/me',
        reply: () => jsonResponse({ email: 'pikachu@piposaude.com.br', policies: [] }),
      },
      { method: 'GET', path: '/api/tickets', reply: () => jsonResponse([]) },
    ])

    const router = await routerRender('/login')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })

  it('renders the protected page and logs out from the sidebar footer', async () => {
    setupApi([
      {
        method: 'GET',
        path: '/api/auth/me',
        reply: () => jsonResponse({ email: 'pikachu@piposaude.com.br', policies: [] }),
      },
      { method: 'GET', path: '/api/tickets', reply: () => jsonResponse([]) },
      {
        method: 'POST',
        path: '/api/auth/logout',
        reply: () => new Response(null, { status: 204 }),
      },
    ])

    const router = await routerRender('/')
    const user = userEvent.setup()

    // The shell has no top bar: identity and logout live in the sidebar footer.
    // At rest only the person shows; e-mail and logout appear in the panel.
    await user.click(await screen.findByRole('button', { name: /conta de/i }))
    expect(await screen.findByText('pikachu@piposaude.com.br')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: sidebarConstants.logout }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', url: expect.stringContaining('/api/auth/logout') }),
    )
    expect(useSessionStore.getState().status).toBe('unauthenticated')
  })

  it('keeps the queue reachable once authenticated', async () => {
    setupApi([
      {
        method: 'GET',
        path: '/api/auth/me',
        reply: () => jsonResponse({ email: 'pikachu@piposaude.com.br', policies: [] }),
      },
      { method: 'GET', path: '/api/tickets', reply: () => jsonResponse([]) },
    ])

    await routerRender('/')

    // The queue is the root: you land on the day's work.
    expect(await screen.findByRole('navigation', { name: /pipodesk/i })).toBeInTheDocument()
  })
})
