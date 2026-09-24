import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { ROOT_GROUP_ID, VIEWER_GROUP_ID, VIEWER_ID } from '../../fixtures/pipodesk/dataset'
import { DEFAULT_SORT } from '@/lib/pipodesk/sort'
import { fixtureStructureRoutes, page, type ApiMock } from '../../helpers/api'

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

type SavedView = Record<string, unknown> & { id: string }

let desk: ApiMock
let views: SavedView[]

async function renderDesk(writes: Record<string, unknown> = {}) {
  const seeded = fixtureStructureRoutes(VIEWER_ID)['/api/queues'] as { data: SavedView[] }
  views = [...seeded.data]
  desk = (await import('../../helpers/desk')).mountDeskFixture(
    {},
    {
      '/api/queues': () => page(views),
      'POST /api/queues': (body: Record<string, unknown>) => {
        const created = { ...body, id: `view-${views.length}`, favorite: false } as SavedView
        views = [...views, created]
        return { status: 201, body: created }
      },
      ...writes,
    },
  )
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
  await screen.findByRole('table')
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
