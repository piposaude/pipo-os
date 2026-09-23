import { render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import { DESK_POLICIES } from '@/lib/policy'
import type { AuthMe } from '@pipo-os/api-client'
import { fixtureStructureRoutes, mockApi, type ApiMock } from '../../helpers/api'

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

const session = (overrides: Partial<AuthMe>): AuthMe => ({
  sub: 'user-15',
  email: 'analista@piposaude.com.br',
  name: 'Analista Fixture',
  policies: [...DESK_POLICIES],
  groups: [],
  ...overrides,
})

let api: ApiMock

async function renderAs(user: AuthMe) {
  api = mockApi(fixtureStructureRoutes(user.sub ?? undefined))
  useSessionStore.setState({ status: 'authenticated', user })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
}

const podOrder = async () => {
  const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
  return (await within(sidebar).findAllByRole('button', { name: /^POD \d/ })).map(
    (button) => button.textContent?.match(/POD \d/)?.[0],
  )
}

const countOf = (name: RegExp) => {
  const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
  return within(sidebar).getByRole('button', { name }).querySelector('span:last-of-type')
    ?.textContent
}

describe('o viewer vem da sessão', () => {
  afterEach(() => {
    api.restore()
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

  it('should abrir a árvore pelo pod de quem logou', async () => {
    await renderAs(session({ groups: [{ groupId: 'pod-2', role: 'member' }] }))

    expect((await podOrder())[0]).toBe('POD 2')
  })

  it('should manter a ordem natural dos pods para quem não é membro de nenhum, sem destacar o da fixture', async () => {
    await renderAs(session({ groups: [{ groupId: 'pod-5', role: 'admin' }] }))

    expect(await podOrder()).toEqual(['POD 1', 'POD 2', 'POD 3', 'POD 4', 'POD 5', 'POD 6'])
  })
})
