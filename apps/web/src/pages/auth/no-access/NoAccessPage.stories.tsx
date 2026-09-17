import type { Meta, StoryObj } from '@storybook/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import NoAccessPage from './index'

// The page's only action navigates, and useNavigate outside a router returns a
// callback that throws when clicked — the story would render a screen whose
// button is broken. A memory router keeps the story honest, and /login lands on
// a marker of its own so the navigation is visible instead of looking like
// nothing happened on the same screen.
const rootRoute = createRootRoute()

const noAccessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/no-access',
  component: NoAccessPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => <p>Tela de login</p>,
})

// Built per render, not once per module: a router kept in module scope would
// stay on /login for every later render of the story.
function NoAccessStory() {
  const router = createRouter({
    routeTree: rootRoute.addChildren([noAccessRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: ['/no-access'] }),
  })

  return <RouterProvider router={router} />
}

const meta: Meta<typeof NoAccessPage> = {
  title: 'Pages/Auth/NoAccess',
  component: NoAccessPage,
  render: () => <NoAccessStory />,
}
export default meta

type Story = StoryObj<typeof NoAccessPage>

export const Default: Story = {
  args: {},
}
