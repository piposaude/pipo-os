import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import {
  DATASET_TODAY,
  FIXTURE_USER_NAMES,
  queueSeed,
  structureFixture,
} from '@/fixtures/pipodesk/dataset'
import { daysOverdue, formatLongDate } from '@/lib/pipodesk/format'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import { analystsOf } from '@/lib/pipodesk/permissions'
import constants from '@/constants/pages/pipodesk/ticket'

/**
 * The first drawn row — the table is virtualized, so only the visible window
 * exists. Waits for the table and fails loudly when there is none: the old
 * `?? ''` turned a missing row into `getByText('')`, which matches an
 * arbitrary element instead of saying what went wrong.
 */
async function firstRow(): Promise<{ id: string; ticket: TicketRow; link: HTMLElement }> {
  await screen.findByRole('table')
  const row = document.querySelector('tr[data-ticket-id]')
  const id = row?.getAttribute('data-ticket-id')
  if (!row || !id) throw new Error('a fila não desenhou nenhuma linha')
  // The row's own link, not a global query by text: the ID cell renders
  // `displayNumber ?? id`, so searching by id only works while the export
  // carries no operational number (PD-011 gives it one).
  return { id, ticket: byId(id), link: within(row as HTMLElement).getByRole('link') }
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
  it('should open from a queue row click, with the person in the title and a copy button for the id', async () => {
    const router = await renderAt('/')
    const user = userEvent.setup()
    const { id, ticket, link } = await firstRow()

    await user.click(link)

    expect(router.state.location.pathname).toBe(`/tickets/${id}`)
    expect(
      // The same expression the page renders, not `?? ''`: an empty name matches
      // nothing, so the assertion would fail for the wrong reason.
      await screen.findByRole('heading', {
        level: 1,
        name: ticket.beneficiaryName ?? ticket.subject,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Copiar o ID ${id}` })).toBeInTheDocument()
  })

  /** The prototype's banner is two parts: the fact in bold, the filed date
   *  after it in plain weight and spelled out (`13 de Julho`) — one sentence,
   *  no period between them. */
  it('should announce the overdue action date in two parts, the fact in bold and the date spelled out', async () => {
    await renderAt('/tickets/705639')
    const ticket = byId('705639')
    const days = daysOverdue(ticket.actionDate!, DATASET_TODAY)!

    const banner = await screen.findByRole('alert')
    const lead = within(banner).getByText(constants.overdueLead(days))

    expect(lead.tagName).toBe('STRONG')
    expect(banner).toHaveTextContent(
      `${constants.overdueLead(days)} ${constants.overdueDate(formatLongDate(ticket.actionDate))}`,
    )
    expect(banner).toHaveTextContent('Registrada para 13 de Julho.')
    expect(banner).not.toHaveTextContent('dias.')
  })

  /** 705639 is 25 days late, so it only ever exercises the plural. `701689`
   *  is filed for the day before the dataset's today — the one fixture that
   *  proves the singular reaches the screen, not just the copy function. */
  it('should say `1 dia` when the movement is a single day overdue', async () => {
    await renderAt('/tickets/701689')
    const ticket = byId('701689')

    const banner = await screen.findByRole('alert')

    expect(daysOverdue(ticket.actionDate!, DATASET_TODAY)).toBe(1)
    expect(within(banner).getByText(constants.overdueLead(1))).toBeInTheDocument()
    expect(banner).toHaveTextContent(
      `${constants.overdueLead(1)} ${constants.overdueDate(formatLongDate(ticket.actionDate))}`,
    )
  })

  /** The same header button as the queue: inside the sidebar it would vanish
   *  on collapse, leaving only the invisible shortcut to bring the menu back. */
  it('should collapse the sidebar from the detail header, and bring it back', async () => {
    await renderAt('/tickets/705639')
    const user = userEvent.setup()

    const toggle = screen.getByRole('button', { name: 'Minimizar menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)

    expect(screen.queryByRole('navigation', { name: /pipodesk/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mostrar menu' }))
    expect(screen.getByRole('navigation', { name: /pipodesk/i })).toBeInTheDocument()
  })

  it('should keep the queue path in the breadcrumb, and going back lands on the same node', async () => {
    const router = await renderAt('/')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Urgentes' }))
    const { link } = await firstRow()
    await user.click(link)

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

  /** The composer writes the channel it is on, and the timeline shows which one
   *  — the PR claims both work, so both are exercised. */
  it('should add a public comment on the channel the composer is switched to', async () => {
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    const composer = await screen.findByRole('group', { name: 'Canal do comentário' })
    await user.click(within(composer).getByRole('button', { name: 'Comentário público' }))

    expect(within(composer).getByRole('button', { name: 'Comentário público' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(composer).getByRole('button', { name: 'Anotação interna' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    const body = 'Enviamos a carteirinha para o RH.'
    await user.type(screen.getByPlaceholderText('Escreva…'), body)
    await user.click(screen.getByRole('button', { name: 'Comentar' }))

    // The entry lands on the public channel, not on the default internal one.
    const entry = screen.getByText(body).closest('li')!
    expect(within(entry).getByText('Comentário público')).toBeInTheDocument()
  })

  /**
   * The field had no accessible name at all — a placeholder is not one, so a
   * screen reader announced a bare text box. The name follows the channel, the
   * same way the placeholder and the submit button already do.
   */
  it('should name the composer field, and rename it with the channel', async () => {
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    expect(
      await screen.findByRole('textbox', { name: constants.timeline.label.internal }),
    ).toBeInTheDocument()

    const composer = screen.getByRole('group', { name: 'Canal do comentário' })
    await user.click(within(composer).getByRole('button', { name: 'Comentário público' }))

    expect(
      screen.getByRole('textbox', { name: constants.timeline.label.public }),
    ).toBeInTheDocument()
  })

  /** The parked channel takes no click, so it can never become the active one
   *  — the reason it is parked is on screen instead of in a tooltip. */
  it('should keep the e-mail channel unclickable while it is parked', async () => {
    await renderAt('/tickets/700003')

    const composer = await screen.findByRole('group', { name: 'Canal do comentário' })
    const email = within(composer).getByRole('button', { name: 'E-mail ao RH' })

    expect(email).toBeDisabled()
    expect(email).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(constants.timeline.emailPending)).toBeInTheDocument()
  })

  /** Every seeded ticket starts with no priority, so the round trip is the only
   *  way to reach the patch that clears it — and "Sem prioridade" is disabled
   *  exactly while it is already the value. */
  it('should clear the priority again from the menu', async () => {
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    const contexto = await screen.findByRole('complementary', { name: 'Contexto do chamado' })
    const trigger = within(contexto).getByRole('button', { name: /prioridade/i })

    await user.click(trigger)
    expect(await screen.findByRole('button', { name: constants.context.noPriority })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Urgente' }))
    expect(trigger).toHaveTextContent('Urgente')

    await user.click(trigger)
    await user.click(await screen.findByRole('button', { name: constants.context.noPriority }))

    expect(trigger).toHaveTextContent(constants.context.noPriority)
  })

  it('should hand the ticket to another analyst and then release it to the pod', async () => {
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    const contexto = await screen.findByRole('complementary', { name: 'Contexto do chamado' })
    const trigger = within(contexto).getByRole('button', { name: /dono/i })

    const [, second] = analystsOf(structureFixture, byId('700003').groupId ?? '').map(
      ({ userId }) => FIXTURE_USER_NAMES[userId],
    )
    await user.click(trigger)
    await user.click(await screen.findByRole('button', { name: second }))
    expect(trigger).toHaveTextContent(second)

    await user.click(trigger)
    await user.click(
      await screen.findByRole('button', { name: constants.context.removeAssignment }),
    )

    expect(trigger).toHaveTextContent(constants.context.free)
  })

  it('should put the id on the clipboard when the copy button is pressed', async () => {
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: constants.copyId('700003') }))

    await expect(navigator.clipboard.readText()).resolves.toBe('700003')
    expect(screen.getByText(constants.copied)).toBeInTheDocument()
  })

  /** As in the prototype: the control is an icon that swaps to a check, and
   *  `Copiado` is announced by a live region instead of replacing the glyph. */
  it('should swap the copy glyph for a check and announce Copiado in a live region', async () => {
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    const button = await screen.findByRole('button', { name: constants.copyId('700003') })
    const status = within(button).getByRole('status')
    /* Both glyphs stay mounted and `data-copied` picks which one shows — the
       swap is a CSS crossfade, and jsdom computes no stylesheet. So the
       assertion is: the pair is there, and the flag flips. */
    expect(button.querySelector('[data-glyph="copy"]')).toBeInTheDocument()
    expect(button.querySelector('[data-glyph="check"]')).toBeInTheDocument()
    expect(status).toBeEmptyDOMElement()
    expect(button).not.toHaveAttribute('data-copied')

    await user.click(button)

    expect(status).toHaveTextContent(constants.copied)
    expect(button).toHaveAttribute('data-copied', 'true')
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
    const { ticket, link } = await firstRow()

    await user.click(link)
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
    const { link } = await firstRow()

    await user.click(link)
    await screen.findByRole('button', { name: 'E-mail ao RH' })

    // The reason has to be readable without hovering — text on screen, not a title.
    expect(screen.getByText(constants.timeline.emailPending)).toBeInTheDocument()
  })

  /**
   * The row's `onClick` is a mouse convenience: a `<tr>` takes no focus and
   * does not activate with Enter, so keyboard-only people had no way to open a
   * ticket at all. The person's name in the Assunto cell is the anchor.
   */
  it('should open the ticket from the keyboard, not only with the mouse', async () => {
    const router = await renderAt('/')
    const user = userEvent.setup()
    const { id, ticket, link } = await firstRow()

    // The anchor is the person's name, not the internal id.
    expect(link).toHaveAccessibleName(ticket.beneficiaryName ?? ticket.subject)
    // A real href, so ⌘-click and open-in-new-tab work like anywhere else.
    expect(link).toHaveAttribute('href', `/tickets/${id}`)

    link.focus()
    expect(link).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(router.state.location.pathname).toBe(`/tickets/${id}`)
  })
})
