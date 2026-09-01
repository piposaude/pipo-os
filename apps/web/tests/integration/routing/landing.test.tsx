import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { isAuthenticated } from '@/lib/auth'

vi.mock('@/lib/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(true),
  logout: vi.fn(),
}))

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

/** Where the root leads, and what it stopped serving. The prototype has no
 *  create-ticket screen — tickets are born from the system. These tests pin
 *  the removal of the scaffold that contradicted that. */
describe('raiz da aplicação', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
  })

  it('should open the queue at the root, with no screen in between', async () => {
    const router = await renderAt('/')

    expect(router.state.location.pathname).toBe('/')
    expect(await screen.findByRole('navigation', { name: /pipodesk/i })).toBeInTheDocument()
  })

  it('should no longer serve the scaffolding form that created tickets by hand', async () => {
    const router = await renderAt('/tickets')

    // Assert on matched routes, not the DOM: with the route gone nothing
    // renders, and "not found in DOM" would pass by accident.
    expect(router.state.matches.map((match) => match.routeId)).not.toContain('/_auth/tickets/')
    expect(screen.queryByRole('button', { name: /criar ticket/i })).not.toBeInTheDocument()
  })

  it('should send the visitor without a session to the login screen', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)

    const router = await renderAt('/')

    expect(router.state.location.pathname).toBe('/login')
  })
})
