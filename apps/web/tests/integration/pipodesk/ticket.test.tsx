import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { queueSeed, structureFixture, FIXTURE_USER_NAMES } from '@/fixtures/pipodesk/dataset'
import { analystsOf } from '@/lib/pipodesk/permissions'
import constants from '@/constants/pages/pipodesk/ticket'

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

  /** The menu's own trigger has to close it: without that, the click reopened
   *  what the outside-pointer had just closed. */
  it('should close the priority menu from its own trigger', async () => {
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    const contexto = await screen.findByRole('complementary', { name: 'Contexto do chamado' })
    const trigger = within(contexto).getByRole('button', { name: /prioridade/i })

    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Prioridade' })).toBeInTheDocument()

    await user.click(trigger)
    expect(screen.queryByRole('dialog', { name: 'Prioridade' })).not.toBeInTheDocument()
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

  /**
   * The roster answers "who may own this ticket", and that comes from the pod's
   * membership — not from whoever happens to hold a ticket right now. An
   * analyst with an empty queue is exactly who you want to hand work to.
   */
  it('should offer the analysts of the pod, from the structure and not from the load', async () => {
    await renderAt('/')
    const user = userEvent.setup()
    const id = firstRowId()
    const ticket = byId(id)

    await user.click(await screen.findByText(id))
    await user.click(await screen.findByRole('button', { name: /^Dono:/ }))

    const menu = screen.getByRole('dialog', { name: 'Dono' })
    const esperados = analystsOf(structureFixture, ticket.groupId ?? '').map(
      (membership) => FIXTURE_USER_NAMES[membership.userId],
    )
    expect(esperados.length).toBeGreaterThan(0)
    for (const name of esperados) {
      expect(within(menu).getByRole('button', { name }), name).toBeInTheDocument()
    }
    // Coordination is not in the analyst rotation — same rule as the queue.
    const coordenacao = structureFixture.memberships
      .filter((m) => m.groupId === ticket.groupId && m.role === 'admin')
      .map((m) => FIXTURE_USER_NAMES[m.userId])
    for (const name of coordenacao) {
      expect(within(menu).queryByRole('button', { name }), name).not.toBeInTheDocument()
    }
  })

  /** The email channel is parked until Fase 6. A `disabled` button with the
   *  reason in `title` explains it to the mouse only: it takes no focus and
   *  the title is not reliably announced. */
  it('should explain the parked email channel in text, not only in a tooltip', async () => {
    await renderAt('/')
    const user = userEvent.setup()
    const id = firstRowId()

    await user.click(await screen.findByText(id))
    await screen.findByRole('button', { name: 'E-mail ao RH' })

    // The reason has to be readable without hovering — text on screen, not a title.
    expect(screen.getByText(constants.timeline.emailPending)).toBeInTheDocument()
  })
})
