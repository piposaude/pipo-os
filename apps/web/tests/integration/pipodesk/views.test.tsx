import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { useSessionStore } from '@/stores/session'
import {
  ROOT_GROUP_ID,
  VIEWER_GROUP_ID,
  VIEWER_ID,
  structureFixture,
} from '@/fixtures/pipodesk/dataset'
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
  entry = '/',
  extra: SavedView[] = [MINE],
) {
  const seeded = fixtureStructureRoutes(VIEWER_ID)['/api/queues'] as { data: SavedView[] }
  views = [...seeded.data, ...extra]
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
      'DELETE /api/queues/:id': (_body: unknown, path: string) => {
        const id = path.split('/').pop()
        views = views.filter((view) => view.id !== id)
        return { status: 204 }
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
    history: createMemoryHistory({ initialEntries: [entry] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
  await within(sidebar()).findAllByRole('button', { name: /^Expandir POD/i })
  return router
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

  it('should keep the dialog and the name when the API refuses the view', async () => {
    await renderDesk({ 'POST /api/queues': () => ({ status: 409, body: { message: 'não' } }) })
    const user = userEvent.setup()
    const dialog = await openSaveView(user)

    await user.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Recusada{Enter}')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Não foi possível salvar a visão.',
    )
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveValue('Recusada')
  })

  it('should take the name typed right after opening, with no click on the field', async () => {
    await renderDesk()
    const user = userEvent.setup()
    await openSaveView(user)

    await user.keyboard('Exclusões vencidas{Enter}')

    expect(desk.calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      name: 'Exclusões vencidas',
    })
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

describe('o menu … da linha da sidebar', () => {
  it('should offer the menu only on what the viewer may edit, and never on a MOV', async () => {
    await renderDesk()
    const user = userEvent.setup()
    await openViewerPod(user)

    expect(
      within(sidebar()).getByRole('button', { name: 'Ações de Minhas urgentes' }),
    ).toBeInTheDocument()
    expect(
      within(sidebar()).queryByRole('button', { name: /^Ações de Meus e livres/ }),
    ).not.toBeInTheDocument()
    expect(
      within(sidebar()).queryByRole('button', { name: /^Ações de (MOV|POD)/ }),
    ).not.toBeInTheDocument()
  })

  it('should delete the view at once, with no confirmation', async () => {
    await renderDesk()
    const user = userEvent.setup()
    await openViewerPod(user)

    await user.click(within(sidebar()).getByRole('button', { name: 'Ações de Minhas urgentes' }))
    await user.click(screen.getByRole('menuitem', { name: 'Apagar view' }))

    expect(desk.calls.find((call) => call.method === 'DELETE')?.path).toBe('/api/queues/view-mine')
    expect(within(sidebar()).queryByText('Minhas urgentes')).not.toBeInTheDocument()
  })

  it('should land on the list of the group when the open view is deleted', async () => {
    await renderDesk()
    const user = userEvent.setup()
    await openViewerPod(user)
    await user.click(within(sidebar()).getByText('Minhas urgentes'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Minhas urgentes')

    await user.click(within(sidebar()).getByRole('button', { name: 'Ações de Minhas urgentes' }))
    await user.click(screen.getByRole('menuitem', { name: 'Apagar view' }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chamados')
  })

  it('should open the same menu on a right click, and rename from it', async () => {
    await renderDesk()
    const user = userEvent.setup()
    await openViewerPod(user)

    await user.pointer({
      keys: '[MouseRight]',
      target: within(sidebar()).getByText('Minhas urgentes'),
    })
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }))

    expect(
      within(sidebar()).getByRole('textbox', { name: 'Renomear Minhas urgentes' }),
    ).toBeInTheDocument()
  })

  it('should bring the view back when the API refuses to delete it', async () => {
    await renderDesk({
      'DELETE /api/queues/:id': () => ({ status: 409, body: { message: 'não' } }),
    })
    const user = userEvent.setup()
    await openViewerPod(user)

    await user.click(within(sidebar()).getByRole('button', { name: 'Ações de Minhas urgentes' }))
    await user.click(screen.getByRole('menuitem', { name: 'Apagar view' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível salvar a alteração.',
    )
    expect(within(sidebar()).getByText('Minhas urgentes')).toBeInTheDocument()
  })

  it('should let the coordination start a view inside a pod, with the place locked', async () => {
    await renderDesk({}, 'coordination')
    const user = userEvent.setup()
    const podName = structureFixture.groups.find((group) => group.id === VIEWER_GROUP_ID)!.name

    await user.click(within(sidebar()).getByRole('button', { name: `Ações de ${podName}` }))
    await user.click(screen.getByRole('menuitem', { name: 'Nova view aqui' }))

    const dialog = await screen.findByRole('dialog', { name: 'Salvar visão' })
    const where = within(dialog).getByRole('combobox', { name: 'Onde ela mora' })
    expect(where).toBeDisabled()
    expect(where).toHaveValue(VIEWER_GROUP_ID)
  })
})

describe('criar visão a partir da página do time', () => {
  it('should open the queue of the pod with Salvar visão locked on it', async () => {
    const router = await renderDesk({}, 'analyst', `/teams/${VIEWER_GROUP_ID}?tab=views`)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: '+ Nova view' }))

    const dialog = await screen.findByRole('dialog', { name: 'Salvar visão' })
    const where = within(dialog).getByRole('combobox', { name: 'Onde ela mora' })
    expect(where).toBeDisabled()
    expect(where).toHaveValue(VIEWER_GROUP_ID)
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chamados')
  })

  it('should not offer Nova view aqui in the sidebar while the team page is open', async () => {
    await renderDesk({}, 'coordination', `/teams/${VIEWER_GROUP_ID}?tab=views`)

    await screen.findByRole('button', { name: '+ Nova view' })
    expect(
      within(sidebar()).queryByRole('button', { name: /^Ações de POD/ }),
    ).not.toBeInTheDocument()
  })
})

describe('as visões fora do pod e em Favoritos', () => {
  it('should leave a view of the root named as a MOV editable by the coordination', async () => {
    const rootView = {
      ...MINE,
      id: 'view-root',
      name: 'MOV PJ',
      groupId: ROOT_GROUP_ID,
      ownerId: null,
    }
    await renderDesk({}, 'coordination', '/', [rootView])
    const user = userEvent.setup()

    await user.click(within(sidebar()).getByRole('button', { name: /Expandir GEBEN/i }))

    expect(within(sidebar()).getByRole('button', { name: 'Ações de MOV PJ' })).toBeInTheDocument()
  })

  it('should rename and delete a view from Favoritos, landing on its group when it was open', async () => {
    await renderDesk({}, 'analyst', '/', [{ ...MINE, favorite: true }])
    const user = userEvent.setup()

    await user.click(within(sidebar()).getByText('Minhas urgentes'))
    await user.dblClick(within(sidebar()).getByText('Minhas urgentes'))
    expect(
      within(sidebar()).getByRole('textbox', { name: 'Renomear Minhas urgentes' }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(within(sidebar()).getByRole('button', { name: 'Ações de Minhas urgentes' }))
    await user.click(screen.getByRole('menuitem', { name: 'Apagar view' }))

    expect(desk.calls.find((call) => call.method === 'DELETE')?.path).toBe('/api/queues/view-mine')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chamados')
  })
})
