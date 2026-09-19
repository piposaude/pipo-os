import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import type { AuthMe } from '@pipo-os/api-client'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import constants from '@/constants/pages/auth/no-access'
import sidebarConstants from '@/constants/pipodesk/sidebar'

const TICKET = 'admin/allow/administrate/pipodesk/ticket'
const STRUCTURE = 'admin/allow/administrate/pipodesk/structure'

/** A session as `/api/auth/me` returns it, holding the given policies. */
function authenticateWith(policies: string[]) {
  const user: AuthMe = {
    sub: 'pikachu@piposaude.com.br',
    email: 'pikachu@piposaude.com.br',
    name: 'Pikachu',
    policies,
    groups: [],
  }
  useSessionStore.setState({ status: 'authenticated', user })
}

async function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
  await waitFor(() => {
    expect(router.state.status).toBe('idle')
  })
  return router
}

describe('acesso ao Pipodesk', () => {
  // The logout button reaches the real store, which posts to the API: without a
  // stub the suite opens a connection to VITE_API_URL on every run.
  //
  // Restored by hand instead of `vi.unstubAllGlobals()`, which would also drop
  // the `Request` stub `tests/setup.ts` installs once per file.
  const nativeFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  })

  afterEach(() => {
    globalThis.fetch = nativeFetch
    useSessionStore.setState({ status: 'idle', user: null })
  })

  it('should send a session without any Pipodesk policy to the no-access screen', async () => {
    authenticateWith([])

    const router = await renderAt('/')

    expect(router.state.location.pathname).toBe('/no-access')
    expect(await screen.findByText(constants.title)).toBeInTheDocument()
  })

  it('should not mount the desk shell for a session without access', async () => {
    authenticateWith([])

    await renderAt('/')

    expect(screen.queryByRole('navigation', { name: /pipodesk/i })).not.toBeInTheDocument()
  })

  it('should open the queue for a session holding the ticket policy', async () => {
    authenticateWith([TICKET])

    const router = await renderAt('/')

    expect(router.state.location.pathname).toBe('/')
    expect(await screen.findByRole('navigation', { name: /pipodesk/i })).toBeInTheDocument()
  })

  // Structure alone still reaches the desk: the API grants the group and queue
  // routes to it, and a guard stricter than the API would lock this session out.
  it('should let a session holding only the structure policy reach the desk', async () => {
    authenticateWith([STRUCTURE])

    const router = await renderAt('/')

    expect(router.state.location.pathname).toBe('/')
    expect(
      await screen.findByRole('navigation', { name: sidebarConstants.nav }),
    ).toBeInTheDocument()
  })

  // The API matches policies by prefix, so a broad admin reaches every Pipodesk route.
  it('should open the queue for a wildcard broad enough to cover Pipodesk', async () => {
    authenticateWith(['admin/allow/*'])

    const router = await renderAt('/')

    expect(router.state.location.pathname).toBe('/')
    expect(
      await screen.findByRole('navigation', { name: sidebarConstants.nav }),
    ).toBeInTheDocument()
  })

  it('should refuse a session whose policies are denied on both doors', async () => {
    authenticateWith([
      'admin/allow/*',
      'admin/deny/administrate/pipodesk/ticket',
      'admin/deny/administrate/pipodesk/structure',
    ])

    const router = await renderAt('/')

    expect(router.state.location.pathname).toBe('/no-access')
  })

  it('should guard the ticket detail too, not only the queue', async () => {
    authenticateWith([])

    const router = await renderAt('/tickets/1')

    expect(router.state.location.pathname).toBe('/no-access')
  })

  it('should send a session that does have access away from the no-access screen', async () => {
    authenticateWith([TICKET])

    const router = await renderAt('/no-access')

    expect(router.state.location.pathname).toBe('/')
  })

  it('should send a visitor with no session at all to the login screen', async () => {
    useSessionStore.setState({ status: 'unauthenticated', user: null })

    const router = await renderAt('/no-access')

    expect(router.state.location.pathname).toBe('/login')
  })

  it('should offer a way out, so the visitor can come back as someone else', async () => {
    authenticateWith([])

    const router = await renderAt('/')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: constants.logout }))

    // The landing matters as much as the button: with the session dropped,
    // /login no longer bounces the visitor back to the queue.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
  })
})
