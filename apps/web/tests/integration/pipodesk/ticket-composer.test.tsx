import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { VIEWER_ID, queueSeed } from '../../fixtures/pipodesk/dataset'
import constants from '@/constants/pages/pipodesk/ticket'
import { apiTicketOf, holdRequest, type ApiMock } from '../../helpers/api'
import { apiTicket } from '../../helpers/ticket'

configure({ asyncUtilTimeout: 3000 })

vi.mock('@/lib/auth', async () => (await import('../../helpers/auth')).deskSession())

const copy = constants.composer
const TICKET = '700003'
const SUBMISSIONS = `/api/tickets/${TICKET}/submissions`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

interface Part {
  channel: string
  body: string
}

let desk: ApiMock
let saved: Part[]
let answer: number

async function mount(routes: Record<string, unknown> = {}) {
  desk?.restore()
  desk = (await import('../../helpers/desk')).mountDeskFixture(
    {},
    {
      [`POST ${SUBMISSIONS}`]: (body: { submissionId: string; parts: Part[] }) => {
        if (answer !== 201) return { status: answer, body: { error: 'x', message: 'recusado' } }
        saved.push(...body.parts)
        const row = queueSeed.find((ticket) => ticket.id === TICKET)!
        return {
          status: 201,
          body: { submissionId: body.submissionId, ticket: apiTicketOf(row), comments: [] },
        }
      },
      [`/api/tickets/${TICKET}/timeline`]: () => ({
        data: saved.map((part, index) => ({
          id: `c${index}`,
          ticketId: TICKET,
          authorId: VIEWER_ID,
          authorType: 'user',
          createdAt: '2026-08-06T10:00:00.000Z',
          type: 'comment',
          channel: part.channel === 'platform' ? 'public' : 'internal',
          visibility: part.channel === 'platform' ? 'public' : 'private',
          body: part.body,
        })),
      }),
      ...routes,
    },
  )
}

beforeEach(async () => {
  saved = []
  answer = 201
  await mount()
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

const destinations = () => screen.findByRole('group', { name: copy.destinationsLabel })
const submissions = (path = SUBMISSIONS) =>
  desk.calls.filter((call) => call.method === 'POST' && call.path === path)
const sendButton = () => screen.getByRole('button', { name: /^Enviar como [^.]+$/ })

describe('composer do chamado', () => {
  it('should start on the internal note, with the e-mail parked and its reason on screen', async () => {
    await renderAt(`/tickets/${TICKET}`)
    const group = await destinations()

    expect(within(group).getByRole('button', { name: copy.destination.internal })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(group).getByRole('button', { name: copy.destination.platform })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(group).getByRole('button', { name: copy.destination.email })).toBeDisabled()
    expect(screen.getByText(copy.emailParked)).toBeInTheDocument()
    expect(screen.getByText(copy.hint.internal)).toBeInTheDocument()
  })

  it('should send one text to Interno and Plataforma do RH in a single submission with two parts', async () => {
    await renderAt(`/tickets/${TICKET}`)
    const user = userEvent.setup()

    await user.click(
      within(await destinations()).getByRole('button', { name: copy.destination.platform }),
    )
    expect(screen.getByText(copy.hint.platform)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: copy.field }), 'Carteirinha enviada.')
    await user.click(sendButton())

    await waitFor(() => expect(submissions()).toHaveLength(1))
    expect(submissions()[0].body).toEqual({
      submissionId: expect.stringMatching(UUID),
      parts: [
        { channel: 'internal', body: 'Carteirinha enviada.' },
        { channel: 'platform', body: 'Carteirinha enviada.' },
      ],
    })
    expect(desk.calls.some((call) => call.path.endsWith('/comments'))).toBe(false)
  })

  it('should clear the draft and reload the timeline once the submission is saved', async () => {
    await renderAt(`/tickets/${TICKET}`)
    const user = userEvent.setup()
    const field = await screen.findByRole('textbox', { name: copy.field })

    await user.type(field, 'Liguei na operadora, protocolo 123.')
    await user.click(sendButton())

    expect(await screen.findByText('Liguei na operadora, protocolo 123.')).toBeInTheDocument()
    expect(field).toHaveValue('')
  })

  it('should keep the draft and say so when the submission is refused, and retry with the same id', async () => {
    answer = 503
    await renderAt(`/tickets/${TICKET}`)
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: copy.field }), 'Não pode sumir.')
    await user.click(sendButton())

    expect(await screen.findByText(copy.sendFailed)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: copy.field })).toHaveValue('Não pode sumir.')

    answer = 201
    await user.click(sendButton())

    await waitFor(() => expect(submissions()).toHaveLength(2))
    const [first, second] = submissions().map(
      (call) => (call.body as { submissionId: string }).submissionId,
    )
    expect(second).toBe(first)
  })

  it('should start a new submission id when the draft changed after a failure', async () => {
    answer = 503
    await renderAt(`/tickets/${TICKET}`)
    const user = userEvent.setup()
    const field = await screen.findByRole('textbox', { name: copy.field })

    await user.type(field, 'Primeira versão.')
    await user.click(sendButton())
    await screen.findByText(copy.sendFailed)
    await user.type(field, ' Corrigida.')
    await user.click(sendButton())

    await waitFor(() => expect(submissions()).toHaveLength(2))
    const [first, second] = submissions().map(
      (call) => (call.body as { submissionId: string }).submissionId,
    )
    expect(second).not.toBe(first)
  })

  it('should start a new submission id after one is saved', async () => {
    await renderAt(`/tickets/${TICKET}`)
    const user = userEvent.setup()
    const field = await screen.findByRole('textbox', { name: copy.field })

    await user.type(field, 'Primeiro.')
    await user.click(sendButton())
    await screen.findByText('Primeiro.')
    await user.type(field, 'Segundo.')
    await user.click(sendButton())

    await waitFor(() => expect(submissions()).toHaveLength(2))
    const [first, second] = submissions().map(
      (call) => (call.body as { submissionId: string }).submissionId,
    )
    expect(second).not.toBe(first)
  })

  it('should keep what was typed while the submission was on its way', async () => {
    await renderAt(`/tickets/${TICKET}`)
    const release = holdRequest('POST', SUBMISSIONS)
    const user = userEvent.setup()
    const field = await screen.findByRole('textbox', { name: copy.field })

    await user.type(field, 'Primeira parte.')
    await user.click(sendButton())
    await user.type(field, ' Segunda parte.')
    release()

    await waitFor(() => expect(submissions()).toHaveLength(1))
    await screen.findByText('Primeira parte.')
    expect(field).toHaveValue('Primeira parte. Segunda parte.')
  })

  it('should write a different text for each destination and send each its own', async () => {
    await renderAt(`/tickets/${TICKET}`)
    const user = userEvent.setup()
    const group = await destinations()

    expect(within(group).getByRole('button', { name: copy.split.open })).toBeDisabled()
    await user.click(within(group).getByRole('button', { name: copy.destination.platform }))
    await user.type(screen.getByRole('textbox', { name: copy.field }), 'Rascunho.')
    await user.click(within(group).getByRole('button', { name: copy.split.open }))

    const internal = screen.getByRole('textbox', { name: copy.fieldFor(copy.destination.internal) })
    const platform = screen.getByRole('textbox', { name: copy.fieldFor(copy.destination.platform) })
    expect(internal).toHaveValue('Rascunho.')
    await user.clear(platform)
    await user.type(platform, 'Só para o RH.')
    await user.click(sendButton())

    await waitFor(() => expect(submissions()).toHaveLength(1))
    expect((submissions()[0].body as { parts: Part[] }).parts).toEqual([
      { channel: 'internal', body: 'Rascunho.' },
      { channel: 'platform', body: 'Só para o RH.' },
    ])
  })

  it('should not send until some destination has text', async () => {
    await renderAt(`/tickets/${TICKET}`)
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: copy.field }), '   ')

    expect(sendButton()).toBeDisabled()
  })

  it('should not carry the draft of one ticket into the next', async () => {
    const router = await renderAt(`/tickets/${TICKET}`)
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: copy.field }), 'Só do 700003.')
    await router.navigate({ to: '/tickets/$id', params: { id: '700002' } })

    await screen.findByText('700002')
    expect(screen.getByRole('textbox', { name: copy.field })).toHaveValue('')
  })
})

const ANA = '11122233344'
const LEO = '55566677788'

const family = {
  primary: {
    profile: { tax_id: ANA, name: 'Ana Souza' },
    employment: { admission_date: '2026-03-10' },
  },
  dependents: [{ profile: { tax_id: LEO, name: 'Léo Souza' } }],
  benefit_data: { requested_start_date: '2026-07-01' },
}

type Answer = (body: { submissionId: string }) => { status: number; body: unknown }

async function openTicket(overrides: Parameters<typeof apiTicket>[0], answer?: Answer) {
  const ticket = apiTicket({ id: 'T-1', enrollmentSnapshot: family, ...overrides })
  await mount({
    '/api/tickets/T-1': ticket,
    'POST /api/tickets/T-1/submissions':
      answer ??
      ((body: { submissionId: string }) => ({
        status: 201,
        body: { submissionId: body.submissionId, ticket, comments: [] },
      })),
  })
  await renderAt('/tickets/T-1')
  await screen.findByRole('group', { name: copy.destinationsLabel })
  return userEvent.setup()
}

const statusMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /Trocar a situação$/ }))
  return screen.getByRole('dialog', { name: copy.statusMenu })
}

describe('composer do chamado — Enviar como ⌄', () => {
  it('should name the situation the send carries, starting at the current one', async () => {
    await openTicket({ status: 'carrier-processing' })

    expect(sendButton()).toHaveAccessibleName('Enviar como Na operadora')
    expect(sendButton()).toBeDisabled()
  })

  it('should send only the situation when it is picked by hand, with no text', async () => {
    const user = await openTicket({ status: 'carrier-processing' })

    const menu = await statusMenu(user)
    await user.click(
      within(menu).getByRole('button', { name: 'Enviar como Com o cliente · Falta documento' }),
    )
    expect(sendButton()).toHaveAccessibleName('Enviar como Com o cliente · Falta documento')
    await user.click(sendButton())

    await waitFor(() => expect(submissions('/api/tickets/T-1/submissions')).toHaveLength(1))
    expect(submissions('/api/tickets/T-1/submissions')[0].body).toEqual({
      submissionId: expect.stringMatching(UUID),
      parts: [],
      status: { status: 'missing-documents' },
    })
  })

  it('should send the text and the situation in the same submission', async () => {
    const user = await openTicket({ status: 'carrier-processing' })

    await user.type(screen.getByRole('textbox', { name: copy.field }), 'Operadora pediu o RG.')
    await user.click(
      within(await statusMenu(user)).getByRole('button', {
        name: 'Enviar como Com o cliente · Falta documento',
      }),
    )
    await user.click(sendButton())

    await waitFor(() => expect(submissions('/api/tickets/T-1/submissions')).toHaveLength(1))
    expect(submissions('/api/tickets/T-1/submissions')[0].body).toMatchObject({
      parts: [{ channel: 'internal', body: 'Operadora pediu o RG.' }],
      status: { status: 'missing-documents' },
    })
  })

  it('should mark the situation the send carries in the menu', async () => {
    const user = await openTicket({ status: 'carrier-processing' })

    const menu = await statusMenu(user)

    expect(within(menu).getByRole('button', { name: 'Enviar como Na operadora' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(menu).getByRole('button', { name: 'Enviar como Cancelada' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('should not offer another situation on a closed ticket, and say why on screen', async () => {
    await openTicket({ status: 'completed', closedAt: '2026-08-12T10:00:00.000Z' })

    expect(screen.queryByRole('button', { name: /Trocar a situação$/ })).not.toBeInTheDocument()
    expect(screen.getByText(copy.closed('Concluída'))).toBeInTheDocument()
  })

  it('should keep Concluída unavailable from Com a Pipo, with the reason in the menu', async () => {
    const user = await openTicket({ status: 'broker-processing' })

    const menu = await statusMenu(user)
    const completed = within(menu).getByRole('button', { name: 'Enviar como Concluída' })

    expect(completed).toBeDisabled()
    expect(completed).toHaveAccessibleDescription(copy.completionBlocked.status)
  })

  it('should keep Concluída unavailable when the ticket does not identify every life by CPF', async () => {
    const user = await openTicket({
      status: 'carrier-processing',
      enrollmentSnapshot: { ...family, dependents: [{ profile: { name: 'Sem CPF' } }] },
    })

    const completed = within(await statusMenu(user)).getByRole('button', {
      name: 'Enviar como Concluída',
    })

    expect(completed).toBeDisabled()
    expect(completed).toHaveAccessibleDescription(copy.completionBlocked.lives)
  })

  it('should hold the completion of an inclusion until its data is filled, saying what is missing', async () => {
    const user = await openTicket({ status: 'carrier-processing' })

    await user.click(
      within(await statusMenu(user)).getByRole('button', { name: 'Enviar como Concluída' }),
    )
    await user.keyboard('{Escape}')

    expect(sendButton()).toHaveAccessibleName('Enviar como Concluída')
    expect(sendButton()).toBeDisabled()
    expect(
      screen.getByText(
        'Faltam Carteirinha · Ana, Início da vigência · Ana, Carteirinha · Léo, Início da vigência · Léo.',
      ),
    ).toBeInTheDocument()
  })

  it('should complete a type the rule exempts with no data', async () => {
    const user = await openTicket({
      status: 'broker-processing',
      enrollmentType: 'registration_data_change',
    })

    await user.click(
      within(await statusMenu(user)).getByRole('button', { name: 'Enviar como Concluída' }),
    )
    await user.click(sendButton())

    await waitFor(() => expect(submissions('/api/tickets/T-1/submissions')).toHaveLength(1))
    expect(submissions('/api/tickets/T-1/submissions')[0].body).toMatchObject({
      parts: [],
      status: { status: 'completed' },
    })
  })
})

const drawerCopy = constants.conclusion

const pickCompleted = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    within(await statusMenu(user)).getByRole('button', { name: 'Enviar como Concluída' }),
  )
  return screen.getByRole('dialog', { name: drawerCopy.title })
}

async function fillFamily(user: ReturnType<typeof userEvent.setup>, drawer: HTMLElement) {
  await user.type(within(drawer).getByLabelText('Carteirinha · Ana'), '9912')
  await user.type(within(drawer).getByLabelText('Início da vigência · Ana'), '2026-07-01')
  await user.type(within(drawer).getByLabelText('Carteirinha · Léo'), '9913')
  await user.type(within(drawer).getByLabelText('Início da vigência · Léo'), '2026-07-01')
}

describe('composer do chamado — conclusão', () => {
  it('should open the completion drawer when Concluída is picked, with a row per life', async () => {
    const user = await openTicket({ status: 'carrier-processing' })

    const drawer = await pickCompleted(user)

    expect(within(drawer).getByText('Ana Souza')).toBeInTheDocument()
    expect(within(drawer).getByText('Léo Souza')).toBeInTheDocument()
    expect(within(drawer).getByText(drawerCopy.life('holder', '10/03/26'))).toBeInTheDocument()
    expect(within(drawer).getByText(drawerCopy.life('dependent', '10/03/26'))).toBeInTheDocument()
    expect(within(drawer).getByLabelText('Início da vigência · Ana')).toHaveAttribute(
      'min',
      '2026-02-10',
    )
    expect(within(drawer).getAllByText(drawerCopy.requested('01/07/26'))).toHaveLength(2)
  })

  it('should say in the footer what is missing, and when everything is filled', async () => {
    const user = await openTicket({ status: 'carrier-processing' })

    const drawer = await pickCompleted(user)
    expect(
      within(drawer).getAllByText(
        'Faltam Carteirinha · Ana, Início da vigência · Ana, Carteirinha · Léo, Início da vigência · Léo.',
      ).length,
    ).toBeGreaterThan(0)

    await fillFamily(user, drawer)

    expect(within(drawer).getByText(drawerCopy.allFilled)).toBeInTheDocument()
  })

  it('should flag a start earlier than a month before the admission', async () => {
    const user = await openTicket({ status: 'carrier-processing' })

    const drawer = await pickCompleted(user)
    await user.type(within(drawer).getByLabelText('Início da vigência · Ana'), '2026-01-05')

    expect(within(drawer).getByLabelText('Início da vigência · Ana')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('should complete an inclusion with the card and the start of each life', async () => {
    const user = await openTicket({ status: 'carrier-processing' })

    const drawer = await pickCompleted(user)
    await fillFamily(user, drawer)
    await user.click(within(drawer).getByRole('button', { name: drawerCopy.back }))

    expect(screen.queryByRole('dialog', { name: drawerCopy.title })).not.toBeInTheDocument()
    expect(screen.getByText(drawerCopy.filled(4, 4))).toBeInTheDocument()
    await user.click(sendButton())

    await waitFor(() => expect(submissions('/api/tickets/T-1/submissions')).toHaveLength(1))
    expect(submissions('/api/tickets/T-1/submissions')[0].body).toMatchObject({
      parts: [],
      status: {
        status: 'completed',
        completion: {
          members: [
            { taxId: ANA, idCardNumber: '9912', startDate: '2026-07-01' },
            { taxId: LEO, idCardNumber: '9913', startDate: '2026-07-01' },
          ],
        },
      },
    })
  })

  it('should reopen the drawer from the summary in the composer', async () => {
    const user = await openTicket({ status: 'carrier-processing' })

    const drawer = await pickCompleted(user)
    await user.click(within(drawer).getByRole('button', { name: drawerCopy.back }))
    expect(screen.getByText(drawerCopy.filled(0, 4))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: drawerCopy.fill }))

    expect(screen.getByRole('dialog', { name: drawerCopy.title })).toBeInTheDocument()
  })

  it('should show in the field what the API refused, keeping everything typed', async () => {
    const user = await openTicket({ status: 'carrier-processing' }, () => ({
      status: 422,
      body: {
        error: 'Unprocessable Entity',
        message: 'recusado',
        details: [{ field: `members[${LEO}].startDate`, code: 'before_admission', message: 'x' }],
      },
    }))

    const drawer = await pickCompleted(user)
    await fillFamily(user, drawer)
    await user.click(within(drawer).getByRole('button', { name: drawerCopy.back }))
    await user.click(sendButton())

    const reopened = await screen.findByRole('dialog', { name: drawerCopy.title })
    const start = within(reopened).getByLabelText('Início da vigência · Léo')
    expect(start).toHaveAttribute('aria-invalid', 'true')
    expect(start).toHaveAccessibleDescription(drawerCopy.rejected.before_admission)
    expect(start).toHaveValue('2026-07-01')
    expect(screen.getByText(copy.sendFailed)).toBeInTheDocument()
    expect(within(reopened).queryByText(drawerCopy.allFilled)).not.toBeInTheDocument()
    expect(
      within(reopened).getAllByText(drawerCopy.refused(['Início da vigência · Léo'])).length,
    ).toBeGreaterThan(0)

    await user.click(within(reopened).getByRole('button', { name: drawerCopy.back }))
    expect(sendButton()).toBeDisabled()

    await user.click(screen.getByRole('button', { name: drawerCopy.fill }))
    await user.clear(within(screen.getByRole('dialog')).getByLabelText('Início da vigência · Léo'))
    await user.type(
      within(screen.getByRole('dialog')).getByLabelText('Início da vigência · Léo'),
      '2026-07-02',
    )
    await user.keyboard('{Escape}')
    expect(sendButton()).toBeEnabled()
  })

  it('should ask a single end date on an exclusion, with the requested end beside it', async () => {
    const user = await openTicket({
      status: 'carrier-processing',
      enrollmentType: 'exclusion',
      enrollmentSnapshot: { ...family, benefit_data: { requested_end_date: '2026-08-31' } },
    })

    const drawer = await pickCompleted(user)
    await user.type(within(drawer).getByLabelText('Data de fim da vigência'), '2026-08-31')
    expect(within(drawer).getByText(drawerCopy.requested('31/08/26'))).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: drawerCopy.back }))
    await user.click(sendButton())

    await waitFor(() => expect(submissions('/api/tickets/T-1/submissions')).toHaveLength(1))
    expect(submissions('/api/tickets/T-1/submissions')[0].body).toMatchObject({
      status: { status: 'completed', completion: { endDate: '2026-08-31' } },
    })
  })
})
