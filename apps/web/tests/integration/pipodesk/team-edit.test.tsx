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
  }: { viewer?: 'coordination' | 'analyst'; writes?: Record<string, unknown> } = {},
) {
  groups = structuredClone((fixtureStructureRoutes()['/api/groups'] as { data: ApiGroup[] }).data)
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
  await screen.findByRole('table')
  return router
}

afterEach(() => {
  desk.restore()
})

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
