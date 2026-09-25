import { configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import { VIEWER_ID, queueSeed } from '../../fixtures/pipodesk/dataset'
import constants from '@/constants/pages/pipodesk/ticket'
import { apiTicketOf, holdRequest, type ApiMock } from '../../helpers/api'

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
const submissions = () =>
  desk.calls.filter((call) => call.method === 'POST' && call.path === SUBMISSIONS)

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
    await user.click(screen.getByRole('button', { name: copy.submit }))

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
    await user.click(screen.getByRole('button', { name: copy.submit }))

    expect(await screen.findByText('Liguei na operadora, protocolo 123.')).toBeInTheDocument()
    expect(field).toHaveValue('')
  })

  it('should keep the draft and say so when the submission is refused, and retry with the same id', async () => {
    answer = 503
    await renderAt(`/tickets/${TICKET}`)
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox', { name: copy.field }), 'Não pode sumir.')
    await user.click(screen.getByRole('button', { name: copy.submit }))

    expect(await screen.findByText(copy.sendFailed)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: copy.field })).toHaveValue('Não pode sumir.')

    answer = 201
    await user.click(screen.getByRole('button', { name: copy.submit }))

    await waitFor(() => expect(submissions()).toHaveLength(2))
    const [first, second] = submissions().map(
      (call) => (call.body as { submissionId: string }).submissionId,
    )
    expect(second).toBe(first)
  })

  it('should start a new submission id after one is saved', async () => {
    await renderAt(`/tickets/${TICKET}`)
    const user = userEvent.setup()
    const field = await screen.findByRole('textbox', { name: copy.field })

    await user.type(field, 'Primeiro.')
    await user.click(screen.getByRole('button', { name: copy.submit }))
    await screen.findByText('Primeiro.')
    await user.type(field, 'Segundo.')
    await user.click(screen.getByRole('button', { name: copy.submit }))

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
    await user.click(screen.getByRole('button', { name: copy.submit }))
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
    await user.click(screen.getByRole('button', { name: copy.submit }))

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

    expect(screen.getByRole('button', { name: copy.submit })).toBeDisabled()
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
