import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import { FIXTURE_USER_NAMES } from '@/fixtures/pipodesk/dataset'
import queueConstants from '@/constants/pages/pipodesk/queue'
import { fixtureStructureRoutes, page, type ApiMock } from '../../helpers/api'

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

interface ApiMember {
  userId: string
  role: 'admin' | 'member'
  active: boolean
  companyIds: string[]
}
type ApiGroup = Record<string, unknown> & {
  id: string
  name: string
  parentId: string | null
  members: ApiMember[]
}

const COORDINATION_ID = 'user-1'
const ANALYST_ID = 'user-3'
const ANALYST = FIXTURE_USER_NAMES[ANALYST_ID]

let desk: ApiMock
let groups: ApiGroup[]

const memberPath = (path: string) => {
  const [, , , groupId, , userId] = path.split('/')
  return { groupId, userId }
}

/** A server that keeps what it accepted, so every assertion after a write is
 *  also an assertion about the next read. */
async function renderTeam(
  entry: string,
  {
    viewer = 'coordination',
    writes = {},
    prepare = () => {},
  }: {
    viewer?: 'coordination' | 'analyst'
    writes?: Record<string, unknown>
    prepare?: (seeded: ApiGroup[]) => void
  } = {},
) {
  groups = structuredClone((fixtureStructureRoutes()['/api/groups'] as { data: ApiGroup[] }).data)
  prepare(groups)
  desk = (await import('../../helpers/desk')).mountDeskFixture(
    {},
    {
      '/api/groups': () => page(groups),
      'PATCH /api/groups/:id/members/:memberId': (body: Partial<ApiMember>, path: string) => {
        const { groupId, userId } = memberPath(path)
        const group = groups.find((candidate) => candidate.id === groupId)!
        group.members = group.members.map((member) =>
          member.userId === userId ? { ...member, ...body } : member,
        )
        return { status: 200, body: { groupId, ...group.members.find((m) => m.userId === userId) } }
      },
      'POST /api/groups/:id/members': (
        body: { userId: string; role: ApiMember['role'] },
        path: string,
      ) => {
        const group = groups.find((candidate) => candidate.id === path.split('/')[3])!
        const member = { userId: body.userId, role: body.role, active: true, companyIds: [] }
        group.members = [...group.members, member]
        return { status: 201, body: { groupId: group.id, ...member } }
      },
      'DELETE /api/groups/:id/members/:memberId': (_body: unknown, path: string) => {
        const { groupId, userId } = memberPath(path)
        const group = groups.find((candidate) => candidate.id === groupId)!
        group.members = group.members.filter((member) => member.userId !== userId)
        return { status: 204 }
      },
      ...writes,
    },
  )
  if (viewer === 'coordination') {
    useSessionStore.setState({
      status: 'authenticated',
      user: { ...useSessionStore.getState().user!, sub: COORDINATION_ID, groups: [] },
    })
  }
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [entry] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
  await screen.findByRole('heading', { level: 1 })
  return router
}

afterEach(() => {
  desk.restore()
})

const posts = () => desk.calls.filter((call) => call.method === 'POST')

const rowOf = (name: string) =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .find((row) => within(row).queryByText(name) !== null)

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: `Ações de ${name}` }))
  return screen.findByRole('menu')
}

describe('papel e saída do time', () => {
  it('should make an analyst coordination of the pod, and keep it on the next read', async () => {
    await renderTeam('/teams/pod-1')
    const user = userEvent.setup()

    const menu = await openRowMenu(user, ANALYST)
    await user.click(within(menu).getByRole('menuitem', { name: 'Tornar coordenação' }))

    expect(within(rowOf(ANALYST)!).getByText('Coordenação')).toBeInTheDocument()
    expect(desk.calls).toContainEqual({
      method: 'PATCH',
      path: `/api/groups/pod-1/members/${ANALYST_ID}`,
      body: { role: 'admin' },
    })
    await waitFor(() =>
      expect(groups.find((g) => g.id === 'pod-1')!.members).toContainEqual(
        expect.objectContaining({ userId: ANALYST_ID, role: 'admin' }),
      ),
    )
  })

  it('should put the role back and say so when the API refuses the change', async () => {
    await renderTeam('/teams/pod-1', {
      writes: {
        'PATCH /api/groups/:id/members/:memberId': () => ({
          status: 422,
          body: { message: 'recusado' },
        }),
      },
    })
    const user = userEvent.setup()

    const menu = await openRowMenu(user, ANALYST)
    await user.click(within(menu).getByRole('menuitem', { name: 'Tornar coordenação' }))

    expect(await screen.findByText(queueConstants.writeFailed)).toBeInTheDocument()
    expect(within(rowOf(ANALYST)!).getByText('Analista')).toBeInTheDocument()
  })

  it('should take a person out of the pod', async () => {
    await renderTeam('/teams/pod-1')
    const user = userEvent.setup()

    const menu = await openRowMenu(user, ANALYST)
    await user.click(within(menu).getByRole('menuitem', { name: 'Remover do time' }))

    expect(rowOf(ANALYST)).toBeUndefined()
    expect(desk.calls).toContainEqual({
      method: 'DELETE',
      path: `/api/groups/pod-1/members/${ANALYST_ID}`,
      body: null,
    })
  })

  it('should bring the person back when the API refuses the removal', async () => {
    await renderTeam('/teams/pod-1', {
      writes: {
        'DELETE /api/groups/:id/members/:memberId': () => ({
          status: 404,
          body: { message: 'sumiu' },
        }),
      },
    })
    const user = userEvent.setup()

    const menu = await openRowMenu(user, ANALYST)
    await user.click(within(menu).getByRole('menuitem', { name: 'Remover do time' }))

    expect(await screen.findByText(queueConstants.writeFailed)).toBeInTheDocument()
    expect(rowOf(ANALYST)).toBeDefined()
  })

  /** Absence, not a grey menu: a disabled menu teaches less than none. */
  it('should offer no row actions to someone who does not coordinate the pod', async () => {
    await renderTeam('/teams/pod-1', { viewer: 'analyst' })

    expect(screen.queryByRole('button', { name: /^Ações de/ })).not.toBeInTheDocument()
  })

  /** At the root a person can have several memberships, and a menu that has to
   *  ask "in which pod?" first is a second screen inside a menu. */
  it('should offer no row actions on the operation page, where the pod is a link', async () => {
    await renderTeam('/teams/group-geben')

    expect(
      within(screen.getByRole('table')).queryByRole('button', { name: /^Ações de/ }),
    ).not.toBeInTheDocument()
  })
})

describe('incluir pessoa', () => {
  const OTHER_POD_ANALYST = 'user-6'
  const OTHER = FIXTURE_USER_NAMES[OTHER_POD_ANALYST]
  const FREE = 'user-7'

  async function openAdd(user: ReturnType<typeof userEvent.setup>, title: string) {
    await user.click(await screen.findByRole('button', { name: '+ Adicionar pessoa' }))
    return screen.findByRole('dialog', { name: title })
  }

  it('should add an analyst to the pod, warning where the person already is', async () => {
    await renderTeam('/teams/pod-1')
    const user = userEvent.setup()
    const dialog = await openAdd(user, 'Incluir em POD 1')

    await user.click(within(dialog).getByRole('radio', { name: /Analista/ }))
    await user.click(within(dialog).getByRole('button', { name: OTHER }))
    expect(within(dialog).getByText(`${OTHER} já está em POD 2 (15 empresas).`)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Incluir' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(rowOf(OTHER)!).getByText('Analista')).toBeInTheDocument()
    expect(posts()).toEqual([
      {
        method: 'POST',
        path: '/api/groups/pod-1/members',
        body: { userId: OTHER_POD_ANALYST, role: 'member' },
      },
    ])
  })

  /** Offering only who is missing keeps the 409 of a repeated member out of reach. */
  it('should not offer the people already in the pod', async () => {
    await renderTeam('/teams/pod-1')
    const user = userEvent.setup()
    const dialog = await openAdd(user, 'Incluir em POD 1')

    await user.click(within(dialog).getByRole('radio', { name: /Analista/ }))
    expect(within(dialog).queryByRole('button', { name: ANALYST })).not.toBeInTheDocument()
  })

  it('should keep Incluir off until role and person are chosen', async () => {
    await renderTeam('/teams/pod-1')
    const user = userEvent.setup()
    const dialog = await openAdd(user, 'Incluir em POD 1')

    expect(within(dialog).getByRole('button', { name: 'Incluir' })).toBeDisabled()
    await user.click(within(dialog).getByRole('radio', { name: /Coordenação de POD 1/ }))
    expect(within(dialog).getByRole('button', { name: 'Incluir' })).toBeDisabled()
  })

  it('should take the person back out and say so when the API refuses', async () => {
    await renderTeam('/teams/pod-1', {
      writes: {
        'POST /api/groups/:id/members': () => ({ status: 409, body: { message: 'já está' } }),
      },
    })
    const user = userEvent.setup()
    const dialog = await openAdd(user, 'Incluir em POD 1')

    await user.click(within(dialog).getByRole('radio', { name: /Analista/ }))
    await user.click(within(dialog).getByRole('button', { name: OTHER }))
    await user.click(within(dialog).getByRole('button', { name: 'Incluir' }))

    expect(await screen.findByText(queueConstants.writeFailed)).toBeInTheDocument()
    expect(rowOf(OTHER)).toBeUndefined()
  })

  /** At the root the destination is a question: an analyst goes into a pod. */
  it('should ask for the pod when adding an analyst from the operation page', async () => {
    await renderTeam('/teams/group-geben')
    const user = userEvent.setup()
    const dialog = await openAdd(user, 'Incluir na operação')

    await user.click(within(dialog).getByRole('radio', { name: /Analista/ }))
    await user.click(within(dialog).getByRole('radio', { name: /POD 3/ }))
    await user.click(within(dialog).getByRole('button', { name: FIXTURE_USER_NAMES[FREE] }))
    await user.click(within(dialog).getByRole('button', { name: 'Incluir' }))

    expect(posts()).toEqual([
      { method: 'POST', path: '/api/groups/pod-3/members', body: { userId: FREE, role: 'member' } },
    ])
  })

  /** Coordination of the operation is admin in the root and in every pod,
   *  except where the person already has a seat. */
  it('should make operation coordination admin in the root and in every pod', async () => {
    await renderTeam('/teams/group-geben')
    const user = userEvent.setup()
    const dialog = await openAdd(user, 'Incluir na operação')

    await user.click(within(dialog).getByRole('radio', { name: /Coordenação da operação/ }))
    await user.click(within(dialog).getByRole('button', { name: FIXTURE_USER_NAMES[FREE] }))
    await user.click(within(dialog).getByRole('button', { name: 'Incluir' }))

    await waitFor(() =>
      expect(posts().map((call) => call.path)).toEqual([
        '/api/groups/group-geben/members',
        '/api/groups/pod-1/members',
        '/api/groups/pod-3/members',
        '/api/groups/pod-4/members',
        '/api/groups/pod-5/members',
        '/api/groups/pod-6/members',
      ]),
    )
  })

  it('should not offer the button to someone who does not coordinate the pod', async () => {
    await renderTeam('/teams/pod-1', { viewer: 'analyst' })

    expect(screen.queryByRole('button', { name: '+ Adicionar pessoa' })).not.toBeInTheDocument()
    expect(
      screen.getByText(/só a coordenação de POD 1 edita carteira e membros/i),
    ).toBeInTheDocument()
  })

  /** The empty state names the button instead of repeating it: one main
   *  action per screen, always in the same place. */
  it('should point to the button when the pod has nobody yet', async () => {
    await renderTeam('/teams/pod-1', {
      prepare: (seeded) => {
        seeded.find((group) => group.id === 'pod-1')!.members = []
      },
    })

    expect(screen.getByText(/POD 1 ainda não tem ninguém/)).toBeInTheDocument()
    expect(
      screen.getByText(/Use \+ Adicionar pessoa para o time começar a receber chamado/),
    ).toBeInTheDocument()
  })
})
