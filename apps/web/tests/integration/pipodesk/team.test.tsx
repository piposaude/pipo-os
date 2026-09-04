import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import constants from '@/constants/pages/pipodesk/team'
import sidebarConstants from '@/constants/pipodesk/sidebar'

vi.mock('@/lib/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(true),
  logout: vi.fn(),
}))

async function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation', { name: /pipodesk/i })
  return router
}

describe('home do pod', () => {
  it('should name the pod and say how much open work it carries', async () => {
    await renderAt('/teams/pod-1')

    expect(await screen.findByRole('heading', { level: 1, name: 'POD 1' })).toBeInTheDocument()
    expect(screen.getByText(/\d+ chamados? abertos?/)).toBeInTheDocument()
  })

  /** The warning speaks of an unowned COMPANY, not orphan tickets: their
   *  tickets have owners, by rotation. */
  it('should warn about the companies of the pod that nobody carries', async () => {
    await renderAt('/teams/pod-1')

    /* `note`, not `status`: the count is fixed at load, so there is nothing for a
       live region to announce. */
    expect(screen.getByRole('note', { name: /empresas sem dono/i })).toHaveTextContent(
      /\d+ empresas sem dono · \d+ chamados/,
    )
  })

  /** The same number the sidebar shows on the pod's "Chamados" — counting over
   *  a different base is how the illegitimate subtraction is born. */
  it('should count the same open tickets the sidebar counts for the pod', async () => {
    await renderAt('/teams/pod-1')
    const user = userEvent.setup()
    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })

    await user.click(within(sidebar).getByText('POD 1'))
    // "Chamados" is a leaf: one button holding label and count.
    const naArvore = within(sidebar)
      .getByText('Chamados')
      .closest('button')
      ?.textContent?.replace('Chamados', '')
      .trim()

    expect(screen.getByText(`${naArvore} chamados abertos`)).toBeInTheDocument()
  })

  it('should say who can edit, so read-only does not read as broken', async () => {
    await renderAt('/teams/pod-1')

    expect(
      screen.getByText(/só a coordenação de POD 1 edita carteira e membros/i),
    ).toBeInTheDocument()
  })

  it('should list the people with role, portfolio and open load', async () => {
    await renderAt('/teams/pod-1')

    const table = screen.getByRole('table')
    for (const header of ['Pessoa', 'Papel', 'Carteira', 'Abertos']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
    // Coordination first, and with no portfolio of its own.
    const rows = within(table).getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Coordenação')).toBeInTheDocument()
    expect(within(rows[rows.length - 1]).getByText('Analista')).toBeInTheDocument()
  })

  it('should be reachable from the Home link of the pod in the sidebar', async () => {
    const router = await renderAt('/')
    const user = userEvent.setup()
    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })

    await user.click(within(sidebar).getByText('POD 1'))
    await user.click(within(sidebar).getByRole('link', { name: 'Home' }))

    expect(router.state.location.pathname).toBe('/teams/pod-1')
  })

  it('should say plainly when the group does not exist, instead of rendering an empty page', async () => {
    await renderAt('/teams/pod-inexistente')

    expect(await screen.findByText(/não encontramos esse time/i)).toBeInTheDocument()
  })
})

describe('abas do pod', () => {
  it('should open Carteiras from the sidebar link, listing company, owner and load', async () => {
    const router = await renderAt('/')
    const user = userEvent.setup()
    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })

    await user.click(within(sidebar).getByText('POD 1'))
    await user.click(within(sidebar).getByRole('link', { name: 'Carteiras' }))

    expect(router.state.location.pathname).toBe('/teams/pod-1')
    const table = await screen.findByRole('table')
    for (const header of ['Empresa', 'Dono', 'Abertos']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
    // Unowned first — the group's coordination debt.
    const firstRow = within(table).getAllByRole('row')[1]
    expect(within(firstRow).getByText('Na rotação')).toBeInTheDocument()
  })

  /** The two memos behind this are split on purpose: the tally walks every open
   *  ticket of the pod and must not re-run per keystroke. Nothing pinned either
   *  the filter or the empty state before. */
  it('should filter the portfolio by company and say so when nothing matches', async () => {
    await renderAt('/teams/pod-1?tab=portfolios')
    const user = userEvent.setup()

    const busca = await screen.findByRole('textbox', { name: constants.carteiras.search })
    const todas = screen.getAllByRole('row').length

    const primeira = screen.getAllByRole('row')[1]
    const nome = within(primeira).getAllByRole('cell')[0].textContent!

    await user.type(busca, nome)
    expect(screen.getAllByRole('row').length).toBeLessThan(todas)
    expect(screen.getByText(nome)).toBeInTheDocument()

    await user.clear(busca)
    await user.type(busca, 'zzz-nao-existe')
    expect(screen.getByText(constants.carteiras.noMatch('zzz-nao-existe'))).toBeInTheDocument()
  })

  /**
   * The breadcrumb of a pod leads to the directorate above it, and a
   * directorate holds no companies of its own. That empty table used to share
   * the "nothing matched your search" branch and announced `casa com “”` —
   * a search nobody had made, quoted around nothing.
   */
  it('should say a group has no portfolio instead of blaming an empty search', async () => {
    await renderAt('/teams/group-geben?tab=portfolios')

    const table = await screen.findByRole('table')
    expect(within(table).getByText(constants.carteiras.noPortfolio)).toBeInTheDocument()
    expect(within(table).queryByText(constants.carteiras.noMatch(''))).not.toBeInTheDocument()
  })

  /** The screen above is two clicks from any pod, so it is not a URL only a
   *  test visits. */
  it('should reach the parent group from the breadcrumb of a pod', async () => {
    const router = await renderAt('/teams/pod-1')
    const user = userEvent.setup()

    const breadcrumb = await screen.findByRole('navigation', { name: /breadcrumb/i })
    await user.click(within(breadcrumb).getByRole('link', { name: 'Gestão de Benefícios' }))

    expect(router.state.location.pathname).toBe('/teams/group-geben')
  })

  it('should open Views, spelling out the criterion of each saved view', async () => {
    await renderAt('/teams/pod-1?tab=views')

    const table = await screen.findByRole('table')
    for (const header of ['Recorte', 'Critério', 'Política', 'Abertos']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
    expect(within(table).getByText('MOV CLT')).toBeInTheDocument()
    expect(within(table).getByText('Contrato: CLT')).toBeInTheDocument()
  })

  /** DSP-93: there is no tab bar, so the breadcrumb is what says which section
   *  you are on — it ends in the section, and the group becomes the way back. */
  it.each(['portfolios', 'views'] as const)(
    'should end the breadcrumb in the %s section and make the group a link',
    async (tab) => {
      const router = await renderAt(`/teams/pod-1?tab=${tab}`)
      const user = userEvent.setup()

      const breadcrumb = await screen.findByRole('navigation', { name: /breadcrumb/i })
      const items = within(breadcrumb).getAllByRole('listitem')
      expect(items.at(-1)).toHaveTextContent(sidebarConstants.adminLinks[tab])
      expect(items.at(-1)).not.toHaveTextContent('POD 1')

      await user.click(within(breadcrumb).getByRole('link', { name: 'POD 1' }))
      expect(router.state.location.pathname).toBe('/teams/pod-1')
      expect(router.state.location.search).toEqual({})
    },
  )

  it('should keep the Home count when arriving with no tab param', async () => {
    await renderAt('/teams/pod-1')

    expect(await screen.findByRole('columnheader', { name: 'Pessoa' })).toBeInTheDocument()
  })
})

/** The three pod links share a pathname and differ only in `?tab=`, so the
 *  router's own `activeProps` would light all three. This pins the one that
 *  should be lit. */
describe('link ativo do pod na sidebar', () => {
  it('should mark only the tab the person is on', async () => {
    await renderAt('/teams/pod-1?tab=portfolios')
    const user = userEvent.setup()

    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
    await user.click(within(sidebar).getByText('POD 1'))
    const carteiras = await within(sidebar).findByRole('link', { name: 'Carteiras' })
    expect(carteiras).toHaveAttribute('aria-current', 'page')
    expect(within(sidebar).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    expect(within(sidebar).getByRole('link', { name: 'Views' })).not.toHaveAttribute('aria-current')
  })

  it('should mark Home when the tab param is absent', async () => {
    await renderAt('/teams/pod-1')
    const user = userEvent.setup()

    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
    await user.click(within(sidebar).getByText('POD 1'))

    expect(await within(sidebar).findByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('sidebar fora da fila', () => {
  /** Selecting a node means leaving the current page: without navigation next
   *  to the dispatch, the click updated state and the screen sat still. */
  it('should leave the team page when a sidebar node is clicked', async () => {
    const router = await renderAt('/teams/pod-1')
    const user = userEvent.setup()
    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })

    await user.click(within(sidebar).getByText('Meus tickets'))

    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent(
      'Meus tickets',
    )
  })

  it('should leave the ticket detail the same way', async () => {
    const router = await renderAt('/')
    const user = userEvent.setup()
    // Waits for the table and opens through the row's own link: the `?? ''`
    // fallback used to turn a missing row into `getByText('')`.
    await screen.findByRole('table')
    const row = document.querySelector('tr[data-ticket-id]')
    const id = row?.getAttribute('data-ticket-id')
    if (!row || !id) throw new Error('a fila não desenhou nenhuma linha')
    await user.click(within(row as HTMLElement).getByRole('link'))
    expect(router.state.location.pathname).toBe(`/tickets/${id}`)

    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
    await user.click(within(sidebar).getByText('Urgentes'))

    expect(router.state.location.pathname).toBe('/')
  })
})
