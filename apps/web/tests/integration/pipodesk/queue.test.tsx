import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import queueConstants from '@/constants/pages/pipodesk/queue'

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

const table = () => screen.getByRole('table')

describe('fila operacional', () => {
  it('should open on Meus tickets, with the columns of the prototype', async () => {
    await renderQueue()

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent(
      'Meus tickets',
    )
    for (const header of [
      'ID.',
      'Assunto',
      'Classificação',
      'Vínculo',
      'Empresa',
      'Status',
      'Prazo',
    ]) {
      expect(
        within(table()).getByRole('columnheader', { name: new RegExp(header) }),
      ).toBeInTheDocument()
    }
  })

  /** The tree invariant seen from the screen: the lit node's number is the
   *  size of the list the queue builds. */
  it('should show the same number the sidebar node counts, once the window is off', async () => {
    await renderQueue()
    const user = userEvent.setup()

    // The queue opens with the 30-day window on — the announced total is then
    // SMALLER than the node's (registered divergence). Window off, the
    // invariant closes. The list is no proof — it is virtualized.
    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    await user.click(screen.getByRole('button', { name: /Aberto em/ }))
    await user.click(await screen.findByRole('button', { name: 'Todo o período' }))
    await user.keyboard('{Escape}')

    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })
    const row = within(sidebar).getByText('Meus tickets').closest('div')
    const naArvore = within(row as HTMLElement).getByRole('button', {
      name: /^[\d.]+$/,
    }).textContent

    const anunciado = screen.getByRole('status').textContent ?? ''

    expect(anunciado).toContain(`${Number((naArvore ?? '').replace('.', ''))} chamados`)
  })

  /** The toggle lives in the header: inside the sidebar it would vanish on
   *  collapse, leaving only the invisible shortcut. */
  it('should collapse the sidebar from the header, and bring it back', async () => {
    await renderQueue()
    const user = userEvent.setup()

    const toggle = screen.getByRole('button', { name: 'Minimizar menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)

    expect(screen.queryByRole('navigation', { name: /pipodesk/i })).not.toBeInTheDocument()
    const restore = screen.getByRole('button', { name: 'Mostrar menu' })
    expect(restore).toHaveAttribute('aria-expanded', 'false')

    await user.click(restore)
    expect(screen.getByRole('navigation', { name: /pipodesk/i })).toBeInTheDocument()
  })

  it('should toggle the sidebar with the keyboard shortcut', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.keyboard('{Control>}b{/Control}')

    expect(screen.queryByRole('navigation', { name: /pipodesk/i })).not.toBeInTheDocument()
  })

  /** What a pod opens, in prototype order: the three admin links (navigation,
   *  not queues), the pod's own cuts, saved views and the three MOVs. */
  it('should open a pod with its admin links, cuts and saved views', async () => {
    await renderQueue()
    const user = userEvent.setup()
    const sidebar = screen.getByRole('navigation', { name: /pipodesk/i })

    await user.click(within(sidebar).getByText('POD 1'))

    for (const item of [
      'Home',
      'Carteiras',
      'Views',
      'Chamados',
      'Livres',
      'Por status',
      'Por cliente',
      'MOV CLT',
      'MOV PJ',
      'MOV MB',
    ]) {
      expect(within(sidebar).getByText(item)).toBeInTheDocument()
    }
  })

  it('should switch the queue when a pill is clicked, breadcrumb included', async () => {
    await renderQueue()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Urgentes' }))

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toHaveTextContent('Urgentes')
    // Pills stay the siblings — clicking a leaf does not change level.
    expect(screen.getByRole('button', { name: 'Urgentes' })).toHaveAttribute('aria-current', 'page')
  })

  it('should sort by a column header, and flip the direction on the second click', async () => {
    await renderQueue()
    const user = userEvent.setup()

    const empresa = within(table()).getByRole('columnheader', { name: /Empresa/ })
    await user.click(within(empresa).getByRole('button'))
    expect(empresa).toHaveAttribute('aria-sort', 'ascending')

    await user.click(within(empresa).getByRole('button'))
    expect(empresa).toHaveAttribute('aria-sort', 'descending')
  })

  it('should announce the size of the queue for screen readers, since the header does not show it', async () => {
    await renderQueue()

    expect(screen.getByRole('status')).toHaveTextContent(/\d+ chamados? em Meus tickets/)
  })

  it('should select every ticket of the queue from the header checkbox', async () => {
    await renderQueue()
    const user = userEvent.setup()

    const selectAll = screen.getByRole('checkbox', { name: queueConstants.selectAll })
    await user.click(selectAll)

    const selected = within(table())
      .getAllByRole('row')
      .filter((row) => row.getAttribute('data-selected') === 'true')
    expect(selected.length).toBeGreaterThan(0)
  })
})
