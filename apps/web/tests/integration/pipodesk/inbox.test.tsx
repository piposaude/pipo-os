import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import { DESK_POLICIES } from '@/lib/policy'
import { mockApi, page } from '../../helpers/api'

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

const VIEWER = 'ana@piposaude.com.br'
const COLLEAGUE = 'bruno@piposaude.com.br'
const ROOT_ID = '8f2c9a10-0000-4000-8000-00000000aaaa'
const POD_ID = '8f2c9a10-0000-4000-8000-00000000bbbb'

const row = (n: number, beneficiaryName: string, extra: Record<string, unknown> = {}) => ({
  id: `a0000000-0000-4000-8000-00000000000${n}`,
  displayNumber: String(n),
  enrollmentId: `enr-${n}`,
  companyId: 'c-1',
  status: 'missing-documents',
  title: 'Inclusão de titular',
  beneficiaryName,
  taxId: null,
  companyName: 'Empresa A',
  parentCompanyId: null,
  parentCompanyName: null,
  companyTaxId: null,
  companySize: null,
  carrierId: 'amil',
  carrierName: 'Amil',
  product: 'health',
  enrollmentType: 'inclusion',
  contractType: 'clt',
  relationship: 'holder',
  assigneeId: VIEWER,
  groupId: POD_ID,
  priority: null,
  actionDate: null,
  tags: [],
  sourceSystem: 'enrollment-integrations',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  closedAt: null,
  ...extra,
})

const group = (id: string, name: string, parentId: string | null) => ({
  id,
  name,
  parentId,
  companyIds: [],
  members: [VIEWER, COLLEAGUE].map((userId) => ({
    userId,
    role: 'member',
    active: true,
    companyIds: [],
  })),
  createdBy: VIEWER,
  updatedBy: null,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
})

const quiet = row(1, 'Sem Resposta')
const answered = row(2, 'Respondida Aberta')
const closed = row(3, 'Respondida Fechada', {
  status: 'completed',
  closedAt: '2026-09-22T10:00:00.000Z',
})
const beyondTheCut = row(4, 'Fora Do Recorte')

const baseRoutes = (): Record<string, unknown> => ({
  '/api/groups': page([
    group(ROOT_ID, 'Gestão de Benefícios', null),
    group(POD_ID, 'POD 9', ROOT_ID),
  ]),
  '/api/queues': page([]),
  '/api/users': {
    data: [
      { email: VIEWER, name: 'Ana Souza' },
      { email: COLLEAGUE, name: 'Bruno Lima' },
    ],
  },
  '/api/tickets/rows': { data: [quiet, answered, closed], total: 3 },
  '/api/tickets/inbox': { data: [answered, closed, beyondTheCut], total: 3 },
})

async function renderDesk() {
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      sub: VIEWER,
      email: VIEWER,
      name: 'Ana Souza',
      policies: [...DESK_POLICIES],
      groups: [{ groupId: POD_ID, role: 'member' }],
    },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
}

const sidebar = () => screen.getByRole('navigation', { name: /pipodesk/i })

describe('a caixa de entrada vem da API', () => {
  let api: import('../../helpers/api').ApiMock

  afterEach(() => {
    api.restore()
    useSessionStore.setState({ status: 'idle', user: null })
  })

  it('should contar no nó os chamados que a API devolve', async () => {
    api = mockApi(baseRoutes())
    await renderDesk()

    expect(
      await within(sidebar()).findByRole('button', { name: /^Inbox\s*3$/ }),
    ).toBeInTheDocument()
  })

  it('should abrir no nó a mesma lista que ele conta, fechado e fora do recorte inclusive', async () => {
    api = mockApi(baseRoutes())
    await renderDesk()

    await userEvent.click(await within(sidebar()).findByRole('button', { name: /^Inbox\s*3$/ }))
    const table = await screen.findByRole('table')

    expect(await within(table).findByText('Respondida Aberta')).toBeInTheDocument()
    expect(within(table).getByText('Respondida Fechada')).toBeInTheDocument()
    expect(within(table).getByText('Fora Do Recorte')).toBeInTheDocument()
    expect(within(table).queryByText('Sem Resposta')).not.toBeInTheDocument()
  })

  it('should reler a caixa de entrada depois de reatribuir o que estava nela', async () => {
    const routes = baseRoutes()
    api = mockApi({
      ...routes,
      '/api/tickets/inbox': () =>
        api.calls.some((call) => call.method === 'PATCH')
          ? { data: [], total: 0 }
          : routes['/api/tickets/inbox'],
    })
    await renderDesk()
    const user = userEvent.setup()

    await user.click(await within(sidebar()).findByRole('button', { name: /^Inbox\s*3$/ }))
    await screen.findByText('Respondida Aberta')
    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Reatribuir' }))
    await user.click(await screen.findByRole('button', { name: 'Bruno Lima' }))

    expect(
      await within(sidebar()).findByRole('button', { name: /^Inbox\s*0$/ }),
    ).toBeInTheDocument()
  })

  it('should não contar a fila só com a caixa de entrada enquanto o /rows não chegou', async () => {
    const routes = baseRoutes()
    delete routes['/api/tickets/rows']
    api = mockApi(routes)
    await renderDesk()

    await within(sidebar()).findByRole('button', { name: /^Inbox\s*3$/ })

    expect(within(sidebar()).getByRole('button', { name: /^Em espera\s*0$/ })).toBeInTheDocument()
  })

  it('should manter a fila de pé quando a caixa de entrada falha', async () => {
    const routes = baseRoutes()
    delete routes['/api/tickets/inbox']
    api = mockApi(routes)
    await renderDesk()

    expect(
      await within(sidebar()).findByRole('button', { name: /^Inbox\s*0?$/ }),
    ).toBeInTheDocument()
    expect(
      await within(await screen.findByRole('table')).findByText('Sem Resposta'),
    ).toBeInTheDocument()
  })
})
