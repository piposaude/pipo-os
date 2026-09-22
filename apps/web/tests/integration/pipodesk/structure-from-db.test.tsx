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
  let restore: () => void

  beforeEach(() => {
    restore = mockApi({
      '/api/groups': page([
        group(ROOT_ID, 'Gestão de Benefícios', null),
        group(POD_ID, 'POD 9', ROOT_ID),
      ]),
      '/api/queues': page([
        view('8f2c9a10-0000-4000-8000-00000000c001', 'MOV CLT', { contractTypes: ['clt'] }),
        view('8f2c9a10-0000-4000-8000-00000000c002', 'MOV PJ', { contractTypes: ['pj'] }),
      ]),
    })
  })

  afterEach(() => {
    restore()
    useSessionStore.setState({ status: 'idle', user: null })
  })

  it('should desenhar o pod que está no banco, e não os da fixture', async () => {
    await renderDesk()

    expect(await within(sidebar()).findByRole('button', { name: /^POD 9/ })).toBeInTheDocument()
    expect(within(sidebar()).queryByRole('button', { name: /^POD 1\b/ })).not.toBeInTheDocument()
  })

  it('should desenhar as visões salvas que o banco carrega', async () => {
    await renderDesk()
    await within(sidebar()).findByRole('button', { name: /^POD 9/ })
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Expandir POD 9/i }))

    expect(await within(sidebar()).findByRole('button', { name: /^MOV CLT/ })).toBeInTheDocument()
    expect(within(sidebar()).getByRole('button', { name: /^MOV PJ/ })).toBeInTheDocument()
  })
})
