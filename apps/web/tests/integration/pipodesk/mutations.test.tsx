import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import {
  ANALYSTS_BY_POD,
  FIXTURE_USER_NAMES,
  VIEWER_GROUP_ID,
  VIEWER_ID,
} from '@/fixtures/pipodesk/dataset'
import type { ApiMock } from '../../helpers/api'

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

let desk: ApiMock

async function renderQueue(writes: Record<string, number> = {}) {
  desk = (await import('../../helpers/desk')).mountDeskFixture(writes)
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

const colega = ANALYSTS_BY_POD[VIEWER_GROUP_ID].find((id) => id !== VIEWER_ID)!

async function reassignAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
  const barra = await screen.findByRole('group', { name: 'Ações em lote' })
  await user.click(within(barra).getByRole('button', { name: 'Ações' }))
  await user.click(screen.getByRole('button', { name: 'Reatribuir' }))
  await user.click(await screen.findByRole('button', { name: FIXTURE_USER_NAMES[colega] }))
}

describe('o que a tela muda, a API grava', () => {
  it('should não oferecer em lote a ação que a API ainda não sabe gravar', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))

    expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agendar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mover para carteira' })).not.toBeInTheDocument()
  })

  it('should mandar o novo responsável para a API, um PATCH por chamado', async () => {
    await renderQueue()
    await reassignAll(userEvent.setup())

    const writes = desk.calls.filter((call) => call.method === 'PATCH')

    expect(writes.length).toBeGreaterThan(0)
    expect(writes[0].path).toMatch(/^\/api\/tickets\//)
    expect(writes[0].body).toEqual({ assigneeId: colega })
  })

  it('should desfazer na tela o que a API recusou, em vez de mentir que gravou', async () => {
    await renderQueue({ PATCH: 500 })
    const antes = screen.getByRole('status').textContent

    await reassignAll(userEvent.setup())

    expect(await screen.findByText(/não foi possível/i)).toBeInTheDocument()
    await expect.poll(() => screen.getByRole('status').textContent).toBe(antes)
  })

  it('should mandar a mudança de status pela rota que a audita, não pela do chamado', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Mudar status' }))
    await user.click(await screen.findByRole('button', { name: /Na operadora/ }))

    const status = desk.calls.filter((call) => call.path.endsWith('/status'))

    expect(status.length).toBeGreaterThan(0)
    expect(status[0].body).toEqual({ status: 'carrier-processing' })
  })
})
