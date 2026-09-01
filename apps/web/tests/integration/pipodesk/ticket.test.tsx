import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { queueSeed } from '@/fixtures/pipodesk/dataset'

/** The first drawn ticket, straight from the DOM — the table is virtualized
 *  and only the visible window exists. */
const firstRowId = (): string => {
  const row = document.querySelector('tr[data-ticket-id]')
  return row?.getAttribute('data-ticket-id') ?? ''
}

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

const byId = (id: string) => queueSeed.find((row) => row.id === id)!

describe('detalhe do chamado', () => {
  it('should open from a queue row click, person in the title and id copyable below', async () => {
    const router = await renderAt('/')
    const user = userEvent.setup()
    const id = firstRowId()
    const ticket = byId(id)

    await user.click(await screen.findByText(id))

    expect(router.state.location.pathname).toBe(`/tickets/${id}`)
    expect(
      await screen.findByRole('heading', { level: 1, name: ticket.beneficiaryName ?? '' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Copiar o ID ${id}` })).toBeInTheDocument()
  })

  it('should keep the queue path in the breadcrumb, and going back lands on the same node', async () => {
    const router = await renderAt('/')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Urgentes' }))
    const id = firstRowId()
    await user.click(await screen.findByText(id))

    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(breadcrumb).toHaveTextContent('Urgentes')

    await user.click(within(breadcrumb).getByRole('link', { name: 'Urgentes' }))
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('button', { name: 'Urgentes' })).toHaveAttribute('aria-current', 'page')
  })

  it('should show the situation and let the priority be set from the context column', async () => {
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    const contexto = await screen.findByRole('complementary', { name: 'Contexto do chamado' })
    expect(within(contexto).getByText('Situação')).toBeInTheDocument()

    await user.click(within(contexto).getByRole('button', { name: /prioridade/i }))
    await user.click(await screen.findByRole('button', { name: 'Urgente' }))

    // Same patch as the queue: the new value shows on the trigger.
    expect(within(contexto).getByRole('button', { name: /prioridade/i })).toHaveTextContent(
      'Urgente',
    )
  })

  it('should add an internal note to the timeline through the composer', async () => {
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    const composer = await screen.findByRole('group', { name: 'Canal do comentário' })
    expect(within(composer).getByRole('button', { name: 'Anotação interna' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.type(screen.getByPlaceholderText('Escreva…'), 'Liguei na operadora, protocolo 123.')
    await user.click(screen.getByRole('button', { name: 'Comentar' }))

    expect(screen.getByText('Liguei na operadora, protocolo 123.')).toBeInTheDocument()
    // The field clears for the next note.
    expect(screen.getByPlaceholderText('Escreva…')).toHaveValue('')
  })

  it('should say plainly when the id does not exist', async () => {
    await renderAt('/tickets/000000')

    expect(await screen.findByText(/não existe chamado com o id/i)).toBeInTheDocument()
  })
})
