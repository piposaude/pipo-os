import type { Meta, StoryObj } from '@storybook/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import NoAccessPage from './index'

// The page's only action navigates, and useNavigate outside a router throws
// when the button is clicked. /login gets a marker of its own so the
// navigation is visible in the story.
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

// Built per render: a router in module scope would stay on /login after the
// first navigation.
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
