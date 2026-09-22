import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

let desk: import('../../helpers/api').ApiMock

beforeEach(async () => {
  desk = (await import('../../helpers/desk')).mountDeskFixture()
})

afterEach(() => {
  desk.restore()
})

async function renderAt(entry: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [entry] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
  return router
}

const sidebar = () => screen.getByRole('navigation', { name: /pipodesk/i })
const activeNode = () => within(sidebar()).getByRole('button', { current: 'page' })

describe('a fila cabe no link', () => {
  it('should abrir no nó que a URL nomeia, e não na home', async () => {
    await renderAt('/?node=node-urgentes')

    expect(await within(sidebar()).findByRole('button', { current: 'page' })).toHaveAccessibleName(
      /^Urgentes/,
    )
  })

  it('should escrever na URL o nó escolhido, para o link poder ser colado', async () => {
    const router = await renderAt('/')
    await userEvent.click(within(sidebar()).getByRole('button', { name: /^Novos/ }))

    expect(router.state.location.search).toMatchObject({ node: 'node-novos' })
  })

  it('should voltar ao nó anterior quando o navegador volta', async () => {
    const router = await renderAt('/?node=node-urgentes')
    await userEvent.click(within(sidebar()).getByRole('button', { name: /^Novos/ }))
    expect(activeNode()).toHaveAccessibleName(/^Novos/)

    router.history.back()

    await expect
      .poll(() => activeNode().getAttribute('aria-label') ?? activeNode().textContent)
      .toMatch(/Urgentes/)
  })

  it('should ignorar um nó que não existe, sem quebrar a tela', async () => {
    await renderAt('/?node=node-que-nao-existe')

    expect(await within(sidebar()).findByRole('button', { current: 'page' })).toBeInTheDocument()
  })
})
