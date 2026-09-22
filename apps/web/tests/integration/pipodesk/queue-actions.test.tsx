import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import {
  ANALYSTS_BY_POD,
  FIXTURE_USER_NAMES,
  VIEWER_GROUP_ID,
  VIEWER_ID,
} from '@/fixtures/pipodesk/dataset'
import { isAuthenticated, logout } from '@/lib/auth'
import constants from '@/constants/pages/pipodesk/queue'
import searchCopy from '@/constants/pipodesk/search'

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

async function renderQueue() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
  return router
}

/** Named region, not DOM order: the batch Snackbar is also `role="status"` and
 *  also opens with a number, so picking the first one made the assertion depend
 *  on render order — and, when it lost, compare the batch number to itself. */
const liveCount = () =>
  Number(
    screen
      .getByRole('status', { name: constants.liveCountLabel })
      .textContent?.match(/^(\d+)/)?.[1],
  )

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

  it('should return the focus to the trigger when the panel closes', async () => {
    await renderQueue()
    const user = userEvent.setup()

    const trigger = screen.getByRole('button', { name: 'Filtros' })
    await user.click(trigger)
    // Focus inside the panel: it is the field the panel unmounts under the
    // person's feet, which is what left the focus on `<body>`.
    await user.click(screen.getByRole('button', { name: 'Contrato' }))
    expect(screen.getByRole('button', { name: /^CLT/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
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

  /** The reassign menu listed the viewer's own pod wherever the queue was:
   *  in POD 1 it offered POD 5 analysts and handed them POD 1 tickets. */
  it('should offer the analysts of the pod the queue belongs to', async () => {
    await renderQueue()
    const user = userEvent.setup()

    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
    await user.click(within(sidebar).getByRole('button', { name: 'Expandir POD 1' }))
    await user.click(await within(sidebar).findByRole('button', { name: /^Chamados/ }))

    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Reatribuir' }))

    const painel = screen.getByRole('dialog', { name: 'Ações em lote' })
    const doPod = ANALYSTS_BY_POD['pod-1'].map((id) => FIXTURE_USER_NAMES[id])
    const deFora = ANALYSTS_BY_POD[VIEWER_GROUP_ID].filter(
      (id) => !ANALYSTS_BY_POD['pod-1'].includes(id),
    )
    expect(within(painel).getByRole('button', { name: doPod[0] })).toBeInTheDocument()
    for (const id of deFora) {
      expect(
        within(painel).queryByRole('button', { name: FIXTURE_USER_NAMES[id] }),
      ).not.toBeInTheDocument()
    }
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

    // `archived` is `closedAt`, a separate axis: this cut carries final tickets.
    const aviso = screen.getByText(/em estado final/)
    const ficaram = Number(aviso.textContent?.match(/^(\d+)/)?.[1])
    expect(ficaram).toBeGreaterThan(0)
    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
    const emEspera = within(sidebar).getByText('Em espera').closest('button')
    expect(emEspera?.textContent).toContain(String(antes - ficaram))
  })
  it('should leave the final tickets untouched when the batch changes status', async () => {
    await renderQueue()
    const user = userEvent.setup()

    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
    await user.click(within(sidebar).getByRole('button', { name: /^Cancelamentos/ }))
    const naFila = liveCount()

    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Mudar status' }))
    await user.click(await screen.findByRole('button', { name: /Na operadora/ }))

    // The cancelled ones are still here; only the in-flight half left the cut.
    const ficaram = liveCount()
    expect(ficaram).toBeGreaterThan(0)
    expect(ficaram).toBeLessThan(naFila)

    // And the screen says so, otherwise the selection just vanishes in silence.
    expect(await screen.findByText(/em estado final/)).toHaveTextContent(new RegExp(`^${ficaram} `))
  })

  /** The notice belongs to the batch that produced it. Only the status batch
   *  wrote it, so any other action left it on screen describing a selection
   *  that had already moved. */
  it('should drop the final-tickets notice when the next batch is not a status change', async () => {
    await renderQueue()
    const user = userEvent.setup()

    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
    await user.click(within(sidebar).getByRole('button', { name: /^Cancelamentos/ }))

    await user.click(screen.getByRole('checkbox', { name: /selecionar todos/i }))
    const barra = await screen.findByRole('group', { name: 'Ações em lote' })
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Mudar status' }))
    await user.click(await screen.findByRole('button', { name: /Na operadora/ }))

    expect(await screen.findByText(/em estado final/)).toBeInTheDocument()

    const colega = ANALYSTS_BY_POD[VIEWER_GROUP_ID].find((id) => id !== VIEWER_ID)!
    await user.click(within(barra).getByRole('button', { name: 'Ações' }))
    await user.click(screen.getByRole('button', { name: 'Reatribuir' }))
    await user.click(await screen.findByRole('button', { name: FIXTURE_USER_NAMES[colega] }))

    expect(screen.queryByText(/em estado final/)).not.toBeInTheDocument()
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
        name: /^Guaporé Agropecuária LTDA Matriz · \d/,
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

  it('should close the palette from the × in the field', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.keyboard('{Meta>}k{/Meta}')
    const palette = await screen.findByRole('dialog', { name: /busca/i })
    await user.click(within(palette).getByRole('button', { name: searchCopy.close }))

    expect(screen.queryByRole('dialog', { name: /busca/i })).not.toBeInTheDocument()
  })

  it('should spell the three shortcuts in the footer, the label before the key', async () => {
    await renderQueue()

    await userEvent.setup().keyboard('{Meta>}k{/Meta}')
    const palette = await screen.findByRole('dialog', { name: /busca/i })

    for (const { label, key } of searchCopy.shortcuts) {
      const line = within(palette).getByText(label).closest('span')!
      expect(line).toHaveTextContent(`${label} ${key}`)
    }
  })

  it('should give back the queue the search started from, not the viewer home', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /^Triagem/ }))
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent('Triagem')

    await user.keyboard('{Meta>}k{/Meta}')
    const palette = await screen.findByRole('dialog', { name: /busca/i })
    await user.click(within(palette).getByRole('combobox'))
    await user.paste('guaporé agropecuária')
    await user.click(
      await within(palette).findByRole('option', {
        name: /^Guaporé Agropecuária LTDA Matriz · \d/,
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Sair da busca' }))

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent('Triagem')
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

describe('sair', () => {
  afterEach(() => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
  })

  /** The person asked to leave: staying on the queue with no feedback is worse
   *  than a stale session on the server. The store drops the local session even
   *  when the request fails (`tests/unit/stores/session.test.ts`), so the login
   *  route no longer bounces back. */
  it('should reach the login screen even when the logout request fails', async () => {
    const router = await renderQueue()
    const user = userEvent.setup()
    vi.mocked(logout).mockImplementationOnce(() => {
      vi.mocked(isAuthenticated).mockReturnValue(false)
      return Promise.reject(new Error('sem rede'))
    })

    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
    await user.click(within(sidebar).getByRole('button', { name: /^Conta de/ }))
    await user.click(await screen.findByRole('button', { name: 'Sair' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
    })
  })
})

/**
 * The header cell also carries what the label alone does not teach.
 */
describe('cabeçalho da fila', () => {
  /** The Prazo cell shows two different counts with the same `d` suffix, and
   *  the label alone does not say which is which. */
  it('should explain the Prazo column on hover', async () => {
    await renderQueue()

    const prazo = screen
      .getAllByRole('columnheader')
      .find((cell) => cell.textContent?.startsWith('Prazo'))
    expect(prazo?.querySelector('[title]')?.getAttribute('title')).toMatch(/data de ação/i)
  })
})

/**
 * The header cell carries the per-column controls: a funnel on the columns
 * that filter, the explanation on the ones a label alone does not teach.
 * The prototype's rule is exclusive — a column either sorts or it filters.
 */
describe('funil por coluna', () => {
  it('should open the panel already on the column field, skipping the field list', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Filtrar por Tipo' }))

    // Straight to the options: no "Aberto em", no field list.
    const painel = screen.getByRole('dialog', { name: /filtros/i })
    expect(within(painel).getByRole('button', { name: /^Exclusão/ })).toBeInTheDocument()
    expect(within(painel).queryByRole('button', { name: /Aberto em/ })).not.toBeInTheDocument()
  })

  /** The panel keeps a Voltar when it came from the field list. From a funnel
   *  there is no list behind it, and the button would go nowhere. */
  it('should offer no way back when the field came from a funnel', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Filtrar por Tipo' }))
    const doFunil = screen.getByRole('dialog', { name: /filtros/i })
    expect(within(doFunil).queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument()

    // ...and the toolbar panel, which does have a list behind it, keeps it.
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    await user.click(screen.getByRole('button', { name: 'Tipo' }))
    const daBarra = screen.getByRole('dialog', { name: /filtros/i })
    expect(within(daBarra).getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
  })

  it('should cut the queue from the column funnel, growing the same chip as the panel', async () => {
    await renderQueue()
    const user = userEvent.setup()
    const antes = liveCount()

    await user.click(screen.getByRole('button', { name: 'Filtrar por Tipo' }))
    await user.click(await screen.findByRole('button', { name: /^Exclusão/ }))
    await user.keyboard('{Escape}')

    expect(screen.getByText('Tipo é Exclusão')).toBeInTheDocument()
    expect(liveCount()).toBeLessThan(antes)
  })

  it('should light the dot only on the funnel of the filtered column', async () => {
    await renderQueue()
    const user = userEvent.setup()
    const funil = () => screen.getByRole('button', { name: 'Filtrar por Tipo' })
    const outro = () => screen.getByRole('button', { name: 'Filtrar por Operadora' })

    expect(funil().querySelector('[data-active]')).toBeNull()

    await user.click(funil())
    await user.click(await screen.findByRole('button', { name: /^Exclusão/ }))
    await user.keyboard('{Escape}')

    expect(funil().querySelector('[data-active]')).not.toBeNull()
    expect(outro().querySelector('[data-active]')).toBeNull()
  })

  /** A column either sorts or it filters. Empresa sorts, so it has no funnel —
   *  even though `companyIds` is a field of the global panel. */
  it('should not offer a funnel on a column that sorts', async () => {
    await renderQueue()

    expect(screen.queryByRole('button', { name: 'Filtrar por Empresa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Filtrar por Status' })).not.toBeInTheDocument()
  })

  it('should not change the sort when the funnel is clicked', async () => {
    await renderQueue()
    const user = userEvent.setup()
    const before = screen.getAllByRole('columnheader').map((cell) => cell.getAttribute('aria-sort'))

    await user.click(screen.getByRole('button', { name: 'Filtrar por Tipo' }))

    const after = screen.getAllByRole('columnheader').map((cell) => cell.getAttribute('aria-sort'))
    expect(after).toEqual(before)
  })

  /** The two mappings that do not name their own column: ID. opens Prioridade
   *  because the priority marker lives in that cell, and Assunto opens
   *  Operadora, the first thing its cell prints. */
  it('should open Prioridade from the ID. funnel', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Filtrar por Prioridade' }))

    const painel = screen.getByRole('dialog', { name: /filtros/i })
    expect(within(painel).getByRole('button', { name: /^Sem prioridade/ })).toBeInTheDocument()
  })

  it('should open Operadora from the Assunto funnel', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Filtrar por Operadora' }))

    const painel = screen.getByRole('dialog', { name: /filtros/i })
    expect(within(painel).getByRole('button', { name: /^Unimed Mineira/ })).toBeInTheDocument()
  })

  /** The toolbar panel hangs to the left of its trigger, which sits at the
   *  right edge. From the first data column that same alignment pushed 190 of
   *  the panel's 274px past the table edge, where `overflow-x: hidden` ate them. */
  it('should open the panel toward the side of the table with room for it', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Filtrar por Prioridade' }))
    expect(screen.getByRole('dialog', { name: /filtros/i })).toHaveAttribute('data-align', 'left')

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Filtrar por Vínculo' }))
    expect(screen.getByRole('dialog', { name: /filtros/i })).toHaveAttribute('data-align', 'right')
  })
})
