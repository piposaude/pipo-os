import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import constants from '@/constants/pipodesk/error'

vi.mock('@/lib/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(true),
  logout: vi.fn(),
}))

/** The queue itself blows up on render. */
vi.mock('@/pages/pipodesk/queue', () => ({
  default: () => {
    throw new Error('a fila explodiu')
  },
}))

/**
 * Before this, the only boundary was `SentryErrorBoundary` at the root of the
 * app: one broken screen replaced everything with "Recarregue a página".
 */
describe('erro de render na fila', () => {
  it('should degrade the queue only, keeping the desk navigable', async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(constants.title)
    // The shell survives: the tree is still there to take the person elsewhere.
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: /pipodesk/i })).toBeInTheDocument()
    })
    // And the app-wide fallback never showed up.
    expect(screen.queryByText(/Algo deu errado/)).not.toBeInTheDocument()
  })
})
