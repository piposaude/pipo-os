import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import { FIXTURE_USER_NAMES } from '@/fixtures/pipodesk/dataset'
import queueConstants from '@/constants/pages/pipodesk/queue'
import { fixtureStructureRoutes, fixtureUsersRoute, page, type ApiMock } from '../../helpers/api'

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
    viewer?: 'coordination' | 'pod-coordination' | 'analyst'
    writes?: Record<string, unknown>
    prepare?: (seeded: ApiGroup[]) => void
  } = {},
) {
  groups = structuredClone((fixtureStructureRoutes()['/api/groups'] as { data: ApiGroup[] }).data)
  prepare(groups)
  if (viewer === 'pod-coordination') {
    const pod = groups.find((group) => group.id === 'pod-1')!
    pod.members = pod.members.map((member) =>
      member.userId === ANALYST_ID ? { ...member, role: 'admin' } : member,
    )
  }
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
      'POST /api/groups': (body: { name: string; parentId: string }) => {
        const created = { ...body, id: `group-new-${groups.length}`, companyIds: [], members: [] }
        groups = [...groups, created as ApiGroup]
        return { status: 201, body: created }
      },
      'PATCH /api/groups/:id': (body: { name?: string }, path: string) => {
        const group = groups.find((candidate) => candidate.id === path.split('/')[3])!
        Object.assign(group, body)
        return { status: 200, body: group }
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
  if (viewer !== 'analyst') {
    useSessionStore.setState({
      status: 'authenticated',
      user: {
        ...useSessionStore.getState().user!,
        sub: viewer === 'coordination' ? COORDINATION_ID : ANALYST_ID,
        groups: [],
      },
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

  it('should list the pod of someone who coordinates only that pod, not all of them', async () => {
    await renderTeam('/teams/group-geben', { viewer: 'pod-coordination' })

    const line = rowOf(ANALYST)!
    expect(within(line).getByText('Coordenação')).toBeInTheDocument()
    expect(within(line).getByRole('link', { name: 'POD 1' })).toBeInTheDocument()
    expect(within(line).queryByText('Todos os pods')).not.toBeInTheDocument()
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

  /** An empty list because the people did not load is not "everyone is here". */
  it('should say the people could not be loaded, and read them again on request', async () => {
    let usersDown = true
    await renderTeam('/teams/pod-1', {
      writes: { '/api/users': () => (usersDown ? undefined : fixtureUsersRoute()) },
    })
    const user = userEvent.setup()
    const dialog = await openAdd(user, 'Incluir em POD 1')

    await user.click(within(dialog).getByRole('radio', { name: /Analista/ }))
    expect(within(dialog).getByText('Carregando pessoas…')).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as pessoas.',
    )
    expect(within(dialog).queryByText(/Todo mundo que casa/)).not.toBeInTheDocument()

    usersDown = false
    await user.click(within(dialog).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(dialog).findByRole('button', { name: OTHER })).toBeInTheDocument()
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

describe('renomear o time', () => {
  const header = () => screen.getByRole('heading', { level: 1 }).closest('header')!
  const titleText = () => within(screen.getByRole('heading', { level: 1 })).getByText('POD 1')
  const sidebar = () => screen.getByRole('navigation', { name: /pipodesk/i })
  const patches = () =>
    desk.calls.filter((call) => call.method === 'PATCH' && call.path === '/api/groups/pod-1')

  it('should rename the pod from its title, and the tree follows', async () => {
    await renderTeam('/teams/pod-1')
    const user = userEvent.setup()

    await user.dblClick(titleText())
    const field = screen.getByRole('textbox', { name: 'Renomear POD 1' })
    await user.clear(field)
    await user.type(field, 'POD Sul{Enter}')

    expect(screen.getByRole('heading', { level: 1, name: 'POD Sul' })).toBeInTheDocument()
    expect(within(sidebar()).getByText('POD Sul')).toBeInTheDocument()
    expect(patches()).toEqual([
      { method: 'PATCH', path: '/api/groups/pod-1', body: { name: 'POD Sul' } },
    ])
  })

  it('should rename from the … next to the title, and Esc gives up without writing', async () => {
    await renderTeam('/teams/pod-1')
    const user = userEvent.setup()

    await user.click(within(header()).getByRole('button', { name: 'Ações de POD 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Renomear' }))
    await user.type(screen.getByRole('textbox', { name: 'Renomear POD 1' }), 'x{Escape}')

    expect(screen.getByRole('heading', { level: 1, name: 'POD 1' })).toBeInTheDocument()
    expect(patches()).toEqual([])
  })

  it('should put the name back and say so when the API refuses', async () => {
    await renderTeam('/teams/pod-1', {
      writes: { 'PATCH /api/groups/:id': () => ({ status: 422, body: { message: 'recusado' } }) },
    })
    const user = userEvent.setup()

    await user.dblClick(titleText())
    await user.type(screen.getByRole('textbox', { name: 'Renomear POD 1' }), ' B{Enter}')

    expect(await screen.findByText(queueConstants.writeFailed)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'POD 1' })).toBeInTheDocument()
  })

  it('should rename a pod from its row in the tree', async () => {
    await renderTeam('/teams/pod-1')
    const user = userEvent.setup()

    await user.click(within(sidebar()).getByRole('button', { name: 'Ações de POD 2' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Renomear' }))
    const field = within(sidebar()).getByRole('textbox', { name: 'Renomear POD 2' })
    await user.clear(field)
    await user.type(field, 'POD Norte{Enter}')

    expect(within(sidebar()).getByText('POD Norte')).toBeInTheDocument()
    expect(desk.calls).toContainEqual({
      method: 'PATCH',
      path: '/api/groups/pod-2',
      body: { name: 'POD Norte' },
    })
  })

  it('should give someone who does not coordinate neither the … nor the double click', async () => {
    await renderTeam('/teams/pod-1', { viewer: 'analyst' })
    const user = userEvent.setup()

    expect(
      within(header()).queryByRole('button', { name: 'Ações de POD 1' }),
    ).not.toBeInTheDocument()
    expect(
      within(sidebar()).queryByRole('button', { name: 'Ações de POD 1' }),
    ).not.toBeInTheDocument()
    await user.dblClick(titleText())
    expect(screen.queryByRole('textbox', { name: 'Renomear POD 1' })).not.toBeInTheDocument()
  })
})

describe('novo subtime', () => {
  const header = () => screen.getByRole('heading', { level: 1 }).closest('header')!
  const sidebar = () => screen.getByRole('navigation', { name: /pipodesk/i })
  const created = () =>
    desk.calls.filter((call) => call.method === 'POST' && call.path === '/api/groups')

  it('should create a subteam under the root from the … of the team', async () => {
    await renderTeam('/teams/pod-1')
    const user = userEvent.setup()

    await user.click(within(header()).getByRole('button', { name: 'Ações de POD 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Novo subtime' }))

    expect(
      await within(sidebar()).findByRole('button', { name: 'Expandir Novo subtime' }),
    ).toBeInTheDocument()
    expect(created()).toEqual([
      {
        method: 'POST',
        path: '/api/groups',
        body: { name: 'Novo subtime', parentId: 'group-geben' },
      },
    ])
  })

  /** One level of subteam, not free hierarchy: the tree's width is budgeted
   *  for it, so a subteam made from a pod still hangs from the root. */
  it('should hang the subteam from the root even when made from a pod row in the tree', async () => {
    await renderTeam('/teams/pod-1')
    const user = userEvent.setup()

    await user.click(within(sidebar()).getByRole('button', { name: 'Ações de POD 2' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Novo subtime' }))

    await waitFor(() =>
      expect(created()).toEqual([
        {
          method: 'POST',
          path: '/api/groups',
          body: { name: 'Novo subtime', parentId: 'group-geben' },
        },
      ]),
    )
  })

  it('should not offer a new subteam to someone who coordinates only the pod', async () => {
    await renderTeam('/teams/pod-1', { viewer: 'pod-coordination' })
    const user = userEvent.setup()

    await user.click(within(header()).getByRole('button', { name: 'Ações de POD 1' }))
    expect(await screen.findByRole('menuitem', { name: 'Renomear' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Novo subtime' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(within(sidebar()).getByRole('button', { name: 'Ações de POD 1' }))
    expect(await screen.findByRole('menuitem', { name: 'Renomear' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Novo subtime' })).not.toBeInTheDocument()
  })

  it('should say so when the API refuses the new subteam', async () => {
    await renderTeam('/teams/pod-1', {
      writes: { 'POST /api/groups': () => ({ status: 422, body: { message: 'recusado' } }) },
    })
    const user = userEvent.setup()

    await user.click(within(header()).getByRole('button', { name: 'Ações de POD 1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Novo subtime' }))

    expect(await screen.findByText(queueConstants.writeFailed)).toBeInTheDocument()
    expect(
      within(sidebar()).queryByRole('button', { name: 'Expandir Novo subtime' }),
    ).not.toBeInTheDocument()
  })
})
