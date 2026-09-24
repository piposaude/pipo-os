import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import { ROOT_GROUP_ID, VIEWER_GROUP_ID, VIEWER_ID } from '@/fixtures/pipodesk/dataset'
import { DEFAULT_SORT } from '@/lib/pipodesk/sort'
import { fixtureStructureRoutes, page, type ApiMock } from '../../helpers/api'

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

type SavedView = Record<string, unknown> & { id: string }

let desk: ApiMock
let views: SavedView[]

const COORDINATION_ID = 'user-1'
const MINE: SavedView = {
  id: 'view-mine',
  name: 'Minhas urgentes',
  groupId: VIEWER_GROUP_ID,
  ownerId: VIEWER_ID,
  filters: { priorities: ['urgent'] },
  sort: DEFAULT_SORT,
  groupBy: null,
  favorite: false,
}

async function renderDesk(
  writes: Record<string, unknown> = {},
  viewer: 'analyst' | 'coordination' = 'analyst',
) {
  const seeded = fixtureStructureRoutes(VIEWER_ID)['/api/queues'] as { data: SavedView[] }
  views = [...seeded.data, MINE]
  desk = (await import('../../helpers/desk')).mountDeskFixture(
    {},
    {
      '/api/queues': () => page(views),
      'POST /api/queues': (body: Record<string, unknown>) => {
        const created = { ...body, id: `view-${views.length}`, favorite: false } as SavedView
        views = [...views, created]
        return { status: 201, body: created }
      },
      'PATCH /api/queues/:id': (body: Record<string, unknown>, path: string) => {
        const id = path.split('/').pop()
        views = views.map((view) => (view.id === id ? { ...view, ...body } : view))
        return { status: 200, body: views.find((view) => view.id === id) }
      },
      ...writes,
    },
  )
  if (viewer === 'coordination') {
    useSessionStore.setState({
      status: 'authenticated',
      user: {
        ...useSessionStore.getState().user!,
        sub: COORDINATION_ID,
        groups: [{ groupId: VIEWER_GROUP_ID, role: 'admin' }],
      },
    })
  }
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
  await within(sidebar()).findAllByRole('button', { name: /^Expandir POD/i })
}

async function openViewerPod(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(sidebar()).getAllByRole('button', { name: /^Expandir POD/i })[0])
}

afterEach(() => {
  desk.restore()
})

const sidebar = () => screen.getByRole('navigation', { name: /pipodesk/i })

async function openSaveView(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Salvar esta fila como view' }))
  return screen.findByRole('dialog', { name: 'Salvar visão' })
}

describe('salvar a fila como visão', () => {
  it('should refuse an empty name only when saving, and clear the error on the next key', async () => {
    await renderDesk()
    const user = userEvent.setup()
    const dialog = await openSaveView(user)

    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Dê um nome à visão antes de salvar.',
    )
    expect(desk.calls.filter((call) => call.method === 'POST')).toHaveLength(0)

    await user.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'E')
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('should save the filter, sort and grouping on screen as a personal view', async () => {
    await renderDesk()
    const user = userEvent.setup()
    const dialog = await openSaveView(user)

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Nome' }),
      'Exclusões vencidas{Enter}',
    )

    expect(desk.calls.find((call) => call.method === 'POST')).toEqual({
      method: 'POST',
      path: '/api/queues',
      body: {
        name: 'Exclusões vencidas',
        groupId: ROOT_GROUP_ID,
        ownerId: VIEWER_ID,
        filters: { assigneeIds: ['@me'] },
        sort: DEFAULT_SORT,
        groupBy: 'none',
      },
    })
    expect(screen.queryByRole('dialog', { name: 'Salvar visão' })).not.toBeInTheDocument()

    await user.click(within(sidebar()).getByRole('button', { name: /Expandir GEBEN/i }))
    expect(await within(sidebar()).findByText('Exclusões vencidas')).toBeInTheDocument()
  })

  it('should start where the open queue lives, and let the person choose another group', async () => {
    await renderDesk()
    const user = userEvent.setup()
    const pod = within(sidebar()).getAllByRole('button', { name: /^Expandir POD/i })[0]
    await user.click(pod)
    await user.click(within(sidebar()).getAllByRole('button', { name: /^Chamados/ })[0])

    const dialog = await openSaveView(user)
    const where = within(dialog).getByRole('combobox', { name: 'Onde ela mora' })
    expect(where).toHaveValue(VIEWER_GROUP_ID)

    await user.selectOptions(where, ROOT_GROUP_ID)
    await user.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Tudo meu{Enter}')
    const post = desk.calls.find((call) => call.method === 'POST')
    expect(post?.body).toMatchObject({ groupId: ROOT_GROUP_ID })
  })

  it('should say so when the API refuses the view', async () => {
    await renderDesk({ 'POST /api/queues': () => ({ status: 403, body: { message: 'não' } }) })
    const user = userEvent.setup()
    const dialog = await openSaveView(user)

    await user.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Recusada{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível salvar a alteração.',
    )
  })
})

describe('renomear uma visão na sidebar', () => {
  it('should rename the viewer own view in place, on a double click', async () => {
    await renderDesk()
    const user = userEvent.setup()
    await openViewerPod(user)

    await user.dblClick(within(sidebar()).getByText('Minhas urgentes'))
    const field = within(sidebar()).getByRole('textbox', { name: 'Renomear Minhas urgentes' })
    await user.clear(field)
    await user.type(field, 'Urgentes do dia{Enter}')

    expect(desk.calls.find((call) => call.method === 'PATCH')).toEqual({
      method: 'PATCH',
      path: '/api/queues/view-mine',
      body: { name: 'Urgentes do dia' },
    })
    expect(within(sidebar()).getByText('Urgentes do dia')).toBeInTheDocument()
    expect(within(sidebar()).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('should keep the name when Escape cancels or the field is left empty', async () => {
    await renderDesk()
    const user = userEvent.setup()
    await openViewerPod(user)

    await user.dblClick(within(sidebar()).getByText('Minhas urgentes'))
    await user.type(within(sidebar()).getByRole('textbox'), ' novo{Escape}')
    await user.dblClick(within(sidebar()).getByText('Minhas urgentes'))
    await user.clear(within(sidebar()).getByRole('textbox'))
    await user.keyboard('{Enter}')

    expect(desk.calls.filter((call) => call.method === 'PATCH')).toHaveLength(0)
    expect(within(sidebar()).getByText('Minhas urgentes')).toBeInTheDocument()
  })

  it('should not let an analyst rename the view of the team', async () => {
    await renderDesk()
    const user = userEvent.setup()
    await openViewerPod(user)

    await user.dblClick(within(sidebar()).getAllByText('Meus e livres')[0])

    expect(within(sidebar()).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('should let the coordination rename the view of the team, but never a MOV', async () => {
    await renderDesk({}, 'coordination')
    const user = userEvent.setup()
    await openViewerPod(user)

    await user.dblClick(within(sidebar()).getAllByText('MOV CLT')[0])
    expect(within(sidebar()).queryByRole('textbox')).not.toBeInTheDocument()

    await user.dblClick(within(sidebar()).getAllByText('Meus e livres')[0])
    expect(
      within(sidebar()).getByRole('textbox', { name: 'Renomear Meus e livres' }),
    ).toBeInTheDocument()
  })

  it('should put the old name back when the API refuses it', async () => {
    await renderDesk({
      'PATCH /api/queues/:id': () => ({ status: 409, body: { message: 'não' } }),
    })
    const user = userEvent.setup()
    await openViewerPod(user)

    await user.dblClick(within(sidebar()).getByText('Minhas urgentes'))
    const field = within(sidebar()).getByRole('textbox')
    await user.clear(field)
    await user.type(field, 'Outro nome{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível salvar a alteração.',
    )
    expect(within(sidebar()).getByText('Minhas urgentes')).toBeInTheDocument()
  })
})
