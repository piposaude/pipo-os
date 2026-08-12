import type { Decorator, Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ticketsFixture } from '@/fixtures/tickets'
import TicketsList from './index'

const meta: Meta<typeof TicketsList> = {
  title: 'Pages/Tickets/List',
  component: TicketsList,
}
export default meta

type Story = StoryObj<typeof TicketsList>

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// The page fetches through the central API client, which resolves
// globalThis.fetch lazily — stubbing it here is enough to feed every story
// state without re-implementing the page.
const withApi = (respond: () => Promise<Response>): Decorator => {
  return (Story) => {
    globalThis.fetch = () => respond()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    )
  }
}

export const Default: Story = {
  args: {
    // none — the page reads everything from constants and the tickets hook
  },
  decorators: [withApi(() => Promise.resolve(jsonResponse(ticketsFixture)))],
  parameters: {
    docs: { description: { story: '/tickets' } },
  },
}

export const Loading: Story = {
  args: {
    // none
  },
  decorators: [withApi(() => new Promise<Response>(() => {}))],
}

export const Empty: Story = {
  args: {
    // none
  },
  decorators: [withApi(() => Promise.resolve(jsonResponse([])))],
}

export const Error: Story = {
  args: {
    // none
  },
  decorators: [
    withApi(() => Promise.resolve(jsonResponse({ message: 'Internal Server Error' }, 500))),
  ],
}
