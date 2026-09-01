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

vi.mock('@/lib/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(true),
  logout: vi.fn(),
}))

async function renderQueue() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
  return router
}

const liveCount = () => Number(screen.getByRole('status').textContent?.match(/^(\d+)/)?.[1])

describe('painel de filtros', () => {
  it('should apply a filter from the panel and grow a removable chip', async () => {
    await renderQueue()
    const user = userEvent.setup()
    const antes = liveCount()

    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    await user.click(screen.getByRole('button', { name: 'Tipo' }))
    await user.click(await screen.findByRole('button', { name: /^Exclusão/ }))
    await user.keyboard('{Escape}')

    // The chip reads as a sentence, and the queue shrank.
    expect(screen.getByText('Tipo é Exclusão')).toBeInTheDocument()
    expect(liveCount()).toBeLessThan(antes)

    // O × devolve a fila inteira.
    await user.click(screen.getByRole('button', { name: 'Remover filtro Tipo' }))
    expect(screen.queryByText('Tipo é Exclusão')).not.toBeInTheDocument()
    expect(liveCount()).toBe(antes)
  })

  it('should show the count next to each option — how many I would get', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    await user.click(screen.getByRole('button', { name: 'Contrato' }))

    const painel = screen.getByRole('dialog', { name: /filtros/i })
    const clt = within(painel).getByRole('button', { name: /^CLT/ })
    expect(clt.textContent).toMatch(/CLT\s*\d+/)
  })

  it('should offer the date window as the first item of the panel', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    const painel = screen.getByRole('dialog', { name: /filtros/i })
    const items = within(painel).getAllByRole('button')

    expect(items[0]).toHaveTextContent(/Aberto em/)
  })
})

describe('painel de exibição', () => {
  it('should group the queue and show group headers', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Exibição' }))
    const grupo = screen.getByRole('group', { name: 'Agrupar por' })
    await user.click(within(grupo).getByRole('button', { name: 'Status' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('button', { name: /Com a Pipo/ })).toBeInTheDocument()
  })

  it('should hide a column from the panel', async () => {
    await renderQueue()
    const user = userEvent.setup()
    expect(screen.getByRole('columnheader', { name: 'Vínculo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Exibição' }))
    const colunas = screen.getByRole('group', { name: 'Colunas' })
    await user.click(within(colunas).getByRole('button', { name: 'Vínculo' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('columnheader', { name: 'Vínculo' })).not.toBeInTheDocument()
  })
})

describe('barra de lote', () => {
  it('should appear on selection, reassign the tickets and vanish on clear', async () => {
    await renderQueue()
    const user = userEvent.setup()

    // Select the whole cut and reassign to another analyst.
    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    expect(barra).toHaveTextContent(/\d+ selecionados/)

    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Reatribuir' }))
    // Another analyst of the viewer's pod, straight from the dataset — the name
    // is data, not a test contract.
    const colega = ANALYSTS_BY_POD[VIEWER_GROUP_ID].find((id) => id !== VIEWER_ID)!
    await user.click(await screen.findByRole('button', { name: FIXTURE_USER_NAMES[colega] }))

    // The queue was "mine": reassigning empties the cut — and the bar goes with
    // it, since selection does not survive the rows leaving.
    expect(screen.getByRole('status')).toHaveTextContent(/^0 chamados/)
    expect(screen.queryByRole('group', { name: 'Ações em lote' })).not.toBeInTheDocument()
  })

  it('should change status in batch, keeping the sidebar count honest', async () => {
    await renderQueue()
    const user = userEvent.setup()

    // Window off: the sidebar counts the node's whole set, and the comparison
    // is only fair when the list shows it whole too.
    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    await user.click(screen.getByRole('button', { name: /Aberto em/ }))
    await user.click(await screen.findByRole('button', { name: 'Todo o período' }))
    await user.keyboard('{Escape}')
    const antes = liveCount()

    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Mudar status' }))
    await user.click(await screen.findByRole('button', { name: /Na operadora/ }))

    // Nothing leaves the queue (the cut is by owner, not status)…
    expect(liveCount()).toBe(antes)
    // …mas `Em espera` agora conta a fila inteira.
    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
    const emEspera = within(sidebar).getByText('Em espera').closest('button')
    expect(emEspera?.textContent).toContain(String(antes))
  })
})

describe('busca global', () => {
  it('should open with the shortcut, find a company and land on its synthetic queue', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.keyboard('{Meta>}k{/Meta}')
    const palette = await screen.findByRole('dialog', { name: /busca/i })

    // Paste, not type — the real gesture for a name received via Slack, and the
    // whole query at once keeps the 5-per-category cap from hiding the target.
    await user.click(within(palette).getByRole('combobox'))
    await user.paste('guaporé agropecuária')
    await user.click(
      await within(palette).findByRole('option', {
        name: /^Guaporé Agropecuária Todos os chamados da empresa/,
      }),
    )

    // The queue became the company's cut, with the search exit visible…
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent(/Guaporé/)
    const sair = screen.getByRole('button', { name: 'Sair da busca' })

    // …and exiting returns to where you were.
    await user.click(sair)
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent(
      'Meus tickets',
    )
  })

  it('should open from the sidebar trigger too, teaching the shortcut', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /buscar/i }))

    expect(await screen.findByRole('dialog', { name: /busca/i })).toBeInTheDocument()
  })
})
