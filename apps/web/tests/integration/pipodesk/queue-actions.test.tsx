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

  /** Closing by the trigger must reset the panel: reopening on the previous
   *  subpanel hides the other eleven fields. */
  it('should reopen on the field list, not on the last field visited', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    await user.click(screen.getByRole('button', { name: 'Contrato' }))
    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    await user.click(screen.getByRole('button', { name: 'Filtros' }))

    const painel = screen.getByRole('dialog', { name: /filtros/i })
    expect(within(painel).getAllByRole('button')[0]).toHaveTextContent(/Aberto em/)
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

  /** `visibleColumnKeys` counts the checkbox column; the order does not. The
   *  first data column read as position 1 and offered an arrow that did nothing. */
  it('should disable the left arrow on the first column', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Exibição' }))

    expect(screen.getByRole('button', { name: 'Mover ID. para a esquerda' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mover ID. para a direita' })).toBeEnabled()
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

  /** The bar returned to whatever screen the last selection left open, date
   *  and all — `return null` came after the hooks, so nothing was reset. */
  it('should reopen the batch panel from the start after a new selection', async () => {
    await renderQueue()
    const user = userEvent.setup()
    const selectAll = screen.getByRole('checkbox', { name: /selecionar todos/i })

    await user.click(selectAll)
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Agendar' }))
    expect(screen.getByRole('dialog', { name: 'Ações em lote' })).toBeInTheDocument()

    // By keyboard, so no pointer lands outside the panel — a mouse click would
    // close it on the way and hide the leak.
    selectAll.focus()
    await user.keyboard(' ')
    expect(screen.queryByRole('group', { name: 'Ações em lote' })).not.toBeInTheDocument()

    await user.keyboard(' ')

    expect(await screen.findByRole('group', { name: 'Ações em lote' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Ações em lote' })).not.toBeInTheDocument()
  })

  /** `completed` is out because closing goes through the gates — and
   *  `cancelled` closes the ticket exactly the same way (`FINAL_STATUSES`),
   *  so offering it let a whole cut be closed in batch, unvalidated. */
  it('should not offer a final status in the batch status list', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Mudar status' }))

    const painel = screen.getByRole('dialog', { name: 'Ações em lote' })
    expect(within(painel).getByRole('button', { name: /Na operadora/ })).toBeInTheDocument()
    expect(within(painel).queryByRole('button', { name: /^Cancelada/ })).not.toBeInTheDocument()
    expect(within(painel).queryByRole('button', { name: /^Concluída/ })).not.toBeInTheDocument()
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

  /** Outside `.desk-root`: inside it, the shell's own `> div` rule beat the
   *  overlay's padding and the palette stuck to the top of the screen. */
  it('should render outside the shell, so the shell layout cannot reach it', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.keyboard('{Meta>}k{/Meta}')

    const palette = await screen.findByRole('dialog', { name: 'Busca global' })
    const shell = document.querySelector('.desk-root')
    expect(shell).not.toBeNull()
    expect(shell?.contains(palette)).toBe(false)
  })

  it('should announce the highlighted result to screen readers while the arrows move', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.keyboard('{Meta>}k{/Meta}')
    const field = await screen.findByRole('combobox')
    const options = screen.getAllByRole('option')

    expect(field).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0].id).not.toBe('')

    await user.keyboard('{ArrowDown}')
    expect(field).toHaveAttribute('aria-activedescendant', options[1].id)
  })

  it('should open from the sidebar trigger too, teaching the shortcut', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /buscar/i }))

    expect(await screen.findByRole('dialog', { name: /busca/i })).toBeInTheDocument()
  })

  /** The palette is a modal: Tab must not reach the sidebar and the table
   *  behind it, which stay operable for the mouse but not for the keyboard. */
  it('should keep the keyboard inside the palette while it is open', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.keyboard('{Meta>}k{/Meta}')
    const palette = await screen.findByRole('dialog', { name: 'Busca global' })
    const field = within(palette).getByRole('combobox')
    expect(field).toHaveFocus()

    await user.tab()
    expect(palette.contains(document.activeElement)).toBe(true)

    await user.tab({ shift: true })
    expect(palette.contains(document.activeElement)).toBe(true)
  })

  it('should return the focus to whoever opened it when it closes', async () => {
    await renderQueue()
    const user = userEvent.setup()

    const trigger = screen.getByRole('button', { name: /buscar/i })
    await user.click(trigger)
    await screen.findByRole('dialog', { name: 'Busca global' })

    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })
})
