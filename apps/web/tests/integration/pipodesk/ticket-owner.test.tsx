import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from '@/routeTree.gen'
import constants from '@/constants/pages/pipodesk/ticket'

vi.mock('@/lib/auth', () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(true),
  logout: vi.fn(),
}))

/**
 * A pod with coordination but no analyst — a new pod, or one whose analysts
 * moved out. The roster comes from the structure, so it is empty here, and an
 * empty dialog with no explanation is a dead end.
 */
vi.mock('@/fixtures/pipodesk/dataset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/fixtures/pipodesk/dataset')>()
  return {
    ...actual,
    structureFixture: {
      ...actual.structureFixture,
      memberships: actual.structureFixture.memberships.filter(
        (membership) => !(membership.groupId === 'pod-5' && membership.role === 'member'),
      ),
    },
  }
})

describe('dono num pod sem analista', () => {
  it('should say the pod has no analyst instead of opening an empty menu', async () => {
    const { queueSeed } = await import('@/fixtures/pipodesk/dataset')
    const ticket = queueSeed.find((row) => row.groupId === 'pod-5')!
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [`/tickets/${ticket.id}`] }),
    })
    const user = userEvent.setup()

    render(<RouterProvider router={router} />)
    await user.click(await screen.findByRole('button', { name: /^Dono:/ }))

    const menu = screen.getByRole('dialog', { name: 'Dono' })
    expect(within(menu).getByText(constants.context.noAnalysts)).toBeInTheDocument()
  })
})
