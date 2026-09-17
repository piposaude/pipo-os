import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import type { AuthMe } from '@pipo-os/api-client'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import constants from '@/constants/pages/auth/no-access'
import sidebarConstants from '@/constants/pipodesk/sidebar'

const TICKET = 'admin/allow/administrate/pipodesk/ticket'

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

/** Being logged in is not being allowed in. Anyone with a Pipo e-mail can
 *  reach a session, so the policy is what separates the Pipodesk screens from
 *  the rest of the company. */
describe('acesso ao Pipodesk', () => {
  afterEach(() => {
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

  // The API matches policies by prefix, so a broad admin reaches every
  // Pipodesk route. Refusing them here would lock out someone the API admits.
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

  // The mirror of the /login redirect: a screen that tells someone they have
  // no access, when they do, is as wrong as the shell that breaks on 403.
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

    await renderAt('/')

    expect(await screen.findByRole('button', { name: constants.logout })).toBeInTheDocument()
  })
})
