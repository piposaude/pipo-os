import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import {
  DATASET_TODAY,
  FIXTURE_USER_NAMES,
  VIEWER_ID,
  queueSeed,
  structureFixture,
} from '@/fixtures/pipodesk/dataset'
import { daysOverdue, formatLongDate } from '@/lib/pipodesk/format'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import { analystsOf } from '@/lib/pipodesk/permissions'
import { records } from '@/fixtures/pipodesk/records'
import constants from '@/constants/pages/pipodesk/ticket'
import copyButton from '@/constants/pipodesk/copy-button'
import { apiTicketOf, holdGet } from '../../helpers/api'

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

// This route loads on demand: the first `findBy` after entering it includes a
// dynamic import, and the 1s default is not enough under parallel workers.
configure({ asyncUtilTimeout: 3000 })

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

let desk: import('../../helpers/api').ApiMock

beforeEach(async () => {
  desk = (await import('../../helpers/desk')).mountDeskFixture()
})

afterEach(() => {
  desk.restore()
})

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

/** `dt` → its `dd`: the fact's value as the tab prints it. */
const fact = (panel: HTMLElement, label: string) =>
  within(panel).getByText(label).nextElementSibling

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
  it('should say the benefit enters the branch, naming matriz and filial with their CNPJs', async () => {
    const ticket = byId('700007')
    await renderAt('/tickets/700007')
    const panel = await screen.findByRole('tabpanel')
    const company = records.companyById.get(ticket.companyId)!
    const parent = records.companyById.get(ticket.parentCompanyId!)!

    expect(
      within(panel).getByText(constants.facts.branchNotice(ticket.enrollmentType)),
    ).toHaveTextContent(company.tradeName)

    expect(fact(panel, constants.facts.parentCompany)).toHaveTextContent(parent.tradeName)
    expect(fact(panel, constants.facts.branchCompany)).toHaveTextContent(company.tradeName)
    expect(
      within(panel)
        .getAllByText(constants.facts.cnpj)
        .map((label) => label.nextElementSibling?.textContent),
    ).toEqual([parent.cnpj, company.cnpj])
  })

  it('should keep one company and no branch notice on a ticket of the parent', async () => {
    const ticket = byId('705639')
    await renderAt('/tickets/705639')
    const panel = await screen.findByRole('tabpanel')

    expect(
      within(panel).queryByText(constants.facts.branchNotice(ticket.enrollmentType)),
    ).not.toBeInTheDocument()
    expect(fact(panel, constants.facts.company)).toHaveTextContent(ticket.companyName!)
    expect(fact(panel, constants.facts.structure)).toHaveTextContent(constants.facts.isParent)
  })

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

  it('should draw the timeline the API keeps, in the words of the screen', async () => {
    desk.restore()
    desk = (await import('../../helpers/desk')).mountDeskFixture(
      {},
      {
        '/api/tickets/700003/timeline': {
          data: [
            {
              id: 'e1',
              ticketId: '700003',
              authorId: 'svc:enrollment-integrations',
              authorType: 'service',
              createdAt: '2026-08-05T10:00:00.000Z',
              type: 'status-changed',
              fromStatus: 'broker-processing',
              toStatus: 'carrier-processing',
              reason: null,
            },
            {
              id: 'c1',
              ticketId: '700003',
              authorId: VIEWER_ID,
              authorType: 'user',
              createdAt: '2026-08-06T10:00:00.000Z',
              type: 'comment',
              channel: 'internal',
              visibility: 'private',
              body: 'Liguei na operadora.',
            },
          ],
        },
      },
    )
    await renderAt('/tickets/700003')

    const entry = (await screen.findByText('Liguei na operadora.')).closest('li')!
    expect(within(entry).getByText(FIXTURE_USER_NAMES[VIEWER_ID]!)).toBeInTheDocument()
    expect(within(entry).getByText('Anotação interna')).toBeInTheDocument()
    expect(screen.getByText(/^Situação mudou de .+ para .+\.$/)).toBeInTheDocument()
  })

  it('should post an internal note and show it once the timeline comes back with it', async () => {
    const posted: unknown[] = []
    desk.restore()
    desk = (await import('../../helpers/desk')).mountDeskFixture(
      {},
      {
        '/api/tickets/700003/timeline': () => ({
          data: posted.map((body, index) => ({
            id: `c${index}`,
            ticketId: '700003',
            authorId: VIEWER_ID,
            authorType: 'user',
            createdAt: '2026-08-06T10:00:00.000Z',
            type: 'comment',
            channel: 'internal',
            ...(body as object),
          })),
        }),
      },
    )
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    const composer = await screen.findByRole('group', { name: 'Canal do comentário' })
    expect(within(composer).getByRole('button', { name: 'Anotação interna' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.type(screen.getByPlaceholderText('Escreva…'), 'Liguei na operadora, protocolo 123.')
    posted.push({ visibility: 'private', body: 'Liguei na operadora, protocolo 123.' })
    await user.click(screen.getByRole('button', { name: 'Comentar' }))

    expect(await screen.findByText('Liguei na operadora, protocolo 123.')).toBeInTheDocument()
    expect(desk.calls).toContainEqual({
      method: 'POST',
      path: '/api/tickets/700003/comments',
      body: { kind: 'manual', visibility: 'private', body: 'Liguei na operadora, protocolo 123.' },
    })
    expect(screen.getByPlaceholderText('Escreva…')).toHaveValue('')
  })

  it('should post a public comment on the channel the composer is switched to', async () => {
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

    await waitFor(() =>
      expect(desk.calls).toContainEqual({
        method: 'POST',
        path: '/api/tickets/700003/comments',
        body: { kind: 'manual', visibility: 'public', body },
      }),
    )
  })

  it('should not carry the draft of one ticket into the next', async () => {
    const router = await renderAt('/tickets/700003')
    const user = userEvent.setup()

    await user.type(await screen.findByPlaceholderText('Escreva…'), 'Só do 700003.')
    await router.navigate({ to: '/tickets/$id', params: { id: '700002' } })

    await screen.findByText('700002')
    expect(screen.getByPlaceholderText('Escreva…')).toHaveValue('')
  })

  it('should keep the draft and say so when the comment is refused', async () => {
    desk.restore()
    desk = (await import('../../helpers/desk')).mountDeskFixture({
      'POST /api/tickets/700003/comments': 503,
    })
    await renderAt('/tickets/700003')
    const user = userEvent.setup()

    await user.type(await screen.findByPlaceholderText('Escreva…'), 'Não pode sumir.')
    await user.click(screen.getByRole('button', { name: 'Comentar' }))

    expect(await screen.findByText(constants.timeline.sendFailed)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Escreva…')).toHaveValue('Não pode sumir.')
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
    expect(screen.getByText(copyButton.copied)).toBeInTheDocument()
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

    expect(status).toHaveTextContent(copyButton.copied)
    expect(button).toHaveAttribute('data-copied', 'true')
  })

  it('should wait for the ticket before saying the id does not exist', async () => {
    const { id, beneficiaryName, subject } = queueSeed[0]!
    const release = holdGet(`/api/tickets/${id}`)
    await renderAt(`/tickets/${id}`)

    expect(await screen.findByRole('status', { name: 'Carregando' })).toBeInTheDocument()
    expect(screen.queryByText(/não existe chamado com o id/i)).not.toBeInTheDocument()

    release()
    expect(
      await screen.findByRole('heading', { level: 1, name: beneficiaryName ?? subject }),
    ).toBeInTheDocument()
  })

  it('should say plainly when the id does not exist', async () => {
    await renderAt('/tickets/000000')

    expect(await screen.findByText(/não existe chamado com o id/i)).toBeInTheDocument()
  })

  it('should open a closed ticket, which the queue rows do not carry', async () => {
    const open = queueSeed[0]!
    const closed = {
      ...apiTicketOf(open),
      id: 'closed-1',
      status: 'completed',
      closedAt: '2026-08-01T12:00:00.000Z',
    }
    desk.restore()
    desk = (await import('../../helpers/desk')).mountDeskFixture(
      {},
      { '/api/tickets/closed-1': closed },
    )
    await renderAt('/tickets/closed-1')

    expect(
      await screen.findByRole('heading', { level: 1, name: open.beneficiaryName ?? open.subject }),
    ).toBeInTheDocument()
    expect(screen.getByText('closed-1')).toBeInTheDocument()
  })

  /**
   * The roster answers "who may own this ticket", and that comes from the pod's
   * membership — not from whoever happens to hold a ticket right now. An
   * analyst with an empty queue is exactly who you want to hand work to.
   */
  it('should show the reassignment in the timeline once the write is saved', async () => {
    const ticket = queueSeed.find((row) => row.groupId !== null && row.id === '700003')!
    desk.restore()
    desk = (await import('../../helpers/desk')).mountDeskFixture(
      {},
      {
        [`/api/tickets/${ticket.id}/timeline`]: () => ({
          data: desk.calls
            .filter((call) => call.method === 'PATCH' && call.path === `/api/tickets/${ticket.id}`)
            .map((call, index) => ({
              id: `e${index}`,
              ticketId: ticket.id,
              authorId: VIEWER_ID,
              authorType: 'user',
              createdAt: '2026-08-06T10:00:00.000Z',
              type: 'event',
              eventType: 'assigned',
              body: 'Responsável alterado',
              metadata: call.body as Record<string, unknown>,
            })),
        }),
      },
    )
    await renderAt(`/tickets/${ticket.id}`)
    const user = userEvent.setup()
    const [analyst] = analystsOf(structureFixture, ticket.groupId!).filter(
      (membership) => membership.userId !== ticket.assigneeId,
    )
    const name = FIXTURE_USER_NAMES[analyst!.userId]!

    await user.click(await screen.findByRole('button', { name: /^Dono:/ }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Dono' })).getByRole('button', { name }),
    )

    expect(await screen.findByText(`Responsável alterado: ${name}`)).toBeInTheDocument()
  })

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
