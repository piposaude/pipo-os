import { render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import { DESK_POLICIES } from '@/lib/policy'
import type { AuthMe } from '@pipo-os/api-client'

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

const session = (overrides: Partial<AuthMe>): AuthMe => ({
  sub: 'user-15',
  email: 'analista@piposaude.com.br',
  name: 'Analista Fixture',
  policies: [...DESK_POLICIES],
  groups: [],
  ...overrides,
})

async function renderAs(user: AuthMe) {
  useSessionStore.setState({ status: 'authenticated', user })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
}

const countOf = (name: RegExp) => {
  const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
  return within(sidebar).getByRole('button', { name }).querySelector('span:last-of-type')
    ?.textContent
}

describe('o viewer vem da sessão', () => {
  afterEach(() => {
    useSessionStore.setState({ status: 'idle', user: null })
  })

  it('should recortar os cortes pessoais por quem logou, e não pela pessoa da fixture', async () => {
    await renderAs(session({ sub: 'ninguem@piposaude.com.br' }))

    expect(countOf(/^Urgentes/)).toBe('0')
    expect(countOf(/^Novos/)).toBe('0')
  })

  it('should nomear a conta com quem logou, não com a pessoa da fixture', async () => {
    await renderAs(session({ sub: 'user-15', name: 'Marina Teste' }))

    expect(screen.getByRole('button', { name: /Marina Teste/ })).toBeInTheDocument()
  })

  it('should cair no e-mail quando o auth-service não devolve nome', async () => {
    await renderAs(session({ name: null, email: 'bruno.lima@piposaude.com.br' }))

    expect(screen.getByRole('button', { name: /Bruno Lima/i })).toBeInTheDocument()
  })

  it('should cair no e-mail quando o nome vem em branco, e não mostrar uma conta sem nome', async () => {
    await renderAs(session({ name: '  ', email: 'bruno.lima@piposaude.com.br' }))

    expect(screen.getByRole('button', { name: /Bruno Lima/i })).toBeInTheDocument()
  })
})
