import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import constants from '@/constants/pipodesk/error'
import { isAuthenticated, logout } from '@/lib/auth'

vi.mock('@/lib/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(true),
  logout: vi.fn().mockResolvedValue(undefined),
}))

/** The shell blows up, not a screen inside it — `DeskError` stays real. */
vi.mock('@/components/pipodesk/shell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/pipodesk/shell')>()),
  DeskShell: () => {
    throw new Error('a casca explodiu')
  },
}))

/**
 * With the shell gone the sidebar goes with it, so the fallback is the only
 * surface left: without a way out, "clear preferences and retry" is a loop for
 * any cause the preferences did not create.
 */
describe('erro de render na casca', () => {
  it('should offer a way out of the desk', async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const user = userEvent.setup()

    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(constants.title)
    // No tree behind it — the queue's own fallback keeps that and needs no exit.
    expect(screen.queryByRole('navigation', { name: /pipodesk/i })).not.toBeInTheDocument()

    // Mirrors the store: the local session is dropped, so `/login` no longer
    // bounces the person back to the desk.
    vi.mocked(logout).mockImplementationOnce(() => {
      vi.mocked(isAuthenticated).mockReturnValue(false)
      return Promise.resolve()
    })
    await user.click(screen.getByRole('button', { name: constants.exit }))

    expect(vi.mocked(logout)).toHaveBeenCalled()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
  })
})
