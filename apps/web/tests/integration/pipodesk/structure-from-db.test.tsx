import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import { DESK_POLICIES } from '@/lib/policy'
import { mockApi, page } from '../../helpers/api'

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

const VIEWER = 'ana@piposaude.com.br'
const ROOT_ID = '8f2c9a10-0000-4000-8000-00000000aaaa'
const POD_ID = '8f2c9a10-0000-4000-8000-00000000bbbb'

const group = (id: string, name: string, parentId: string | null) => ({
  id,
  name,
  parentId,
  companyIds: [],
  members: [{ userId: VIEWER, role: 'member', active: true, companyIds: [] }],
  createdBy: VIEWER,
  updatedBy: null,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
})

const view = (id: string, name: string, filters: unknown) => ({
  id,
  name,
  groupId: POD_ID,
  ownerId: null,
  filters,
  sort: { by: 'actionDate', direction: 'asc' },
  groupBy: null,
  favorite: false,
  createdBy: VIEWER,
  updatedBy: null,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
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

describe('a árvore da sidebar vem do banco', () => {
  let api: import('../../helpers/api').ApiMock
  let routes: Record<string, unknown>

  beforeEach(() => {
    routes = {
      '/api/groups': page([
        group(ROOT_ID, 'Gestão de Benefícios', null),
        group(POD_ID, 'POD 9', ROOT_ID),
      ]),
      '/api/tickets/rows': {
        data: [
          {
            id: 'a0000000-0000-4000-8000-000000000001',
            displayNumber: '7',
            enrollmentId: 'enr-7',
            companyId: 'c-1',
            status: 'carrier-processing',
            title: 'Inclusão de titular',
            beneficiaryName: 'Marcos Dias',
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
          },
        ],
        total: 1,
      },
      '/api/users': { data: [{ email: VIEWER, name: 'Ana Souza' }] },
      '/api/queues': page([
        view('8f2c9a10-0000-4000-8000-00000000c001', 'MOV CLT', { contractTypes: ['clt'] }),
        view('8f2c9a10-0000-4000-8000-00000000c002', 'MOV PJ', { contractTypes: ['pj'] }),
      ]),
    }
    api = mockApi(routes)
  })

  afterEach(() => {
    api.restore()
    useSessionStore.setState({ status: 'idle', user: null })
  })

  it('should desenhar o pod que está no banco, e não os da fixture', async () => {
    await renderDesk()

    expect(await within(sidebar()).findByRole('button', { name: /^POD 9/ })).toBeInTheDocument()
    expect(within(sidebar()).queryByRole('button', { name: /^POD 1\b/ })).not.toBeInTheDocument()
  })

  it('should listar o chamado que está no banco', async () => {
    await renderDesk()

    const table = await screen.findByRole('table')

    expect(await within(table).findByText('Marcos Dias')).toBeInTheDocument()
    expect(within(table).getByText('Empresa A')).toBeInTheDocument()
  })

  it('should nomear a analista pela lista de pessoas da API, não pela fixture', async () => {
    await renderDesk()
    await within(sidebar()).findByRole('button', { name: /^POD 9/ })
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Expandir POD 9/i }))
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Expandir MOV CLT/i }))

    expect(await within(sidebar()).findByRole('button', { name: /^Ana Souza/ })).toBeInTheDocument()
  })

  it('should avisar que a fila é um recorte quando o banco tem mais do que coube', async () => {
    api.restore()
    api = mockApi({
      ...routes,
      '/api/tickets/rows': { ...(routes['/api/tickets/rows'] as object), total: 9999 },
    })
    await renderDesk()

    await screen.findByRole('table')

    const aviso = await screen.findByText(/Mostrando um recorte/)

    expect(aviso).toHaveTextContent('999')
    expect(aviso).toHaveTextContent('contagens da árvore valem só para o que está aqui')
  })

  it('should pôr o pod de quem logou na frente dos outros', async () => {
    await renderDesk()
    const geben = await within(sidebar()).findByRole('button', { name: /^GEBEN/ })
    const pods = within(sidebar())
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
      .filter((label) => label.startsWith('POD '))

    expect(geben).toBeInTheDocument()
    expect(pods[0]).toMatch(/^POD 9/)
  })

  it('should oferecer no lote a analista do pod que está no banco', async () => {
    await renderDesk()
    await screen.findByRole('table')
    const user = userEvent.setup()

    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Reatribuir' }))

    expect(await screen.findByRole('button', { name: 'Ana Souza' })).toBeInTheDocument()
  })

  it('should desenhar as visões salvas que o banco carrega', async () => {
    await renderDesk()
    await within(sidebar()).findByRole('button', { name: /^POD 9/ })
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Expandir POD 9/i }))

    expect(await within(sidebar()).findByRole('button', { name: /^MOV CLT/ })).toBeInTheDocument()
    expect(within(sidebar()).getByRole('button', { name: /^MOV PJ/ })).toBeInTheDocument()
  })
})
