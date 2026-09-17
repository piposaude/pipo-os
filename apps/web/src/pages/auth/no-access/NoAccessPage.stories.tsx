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
// button is broken. A memory router keeps the story honest.
const rootRoute = createRootRoute()
const routes = ['/no-access', '/login'].map((path) =>
  createRoute({ getParentRoute: () => rootRoute, path, component: NoAccessPage }),
)

const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  history: createMemoryHistory({ initialEntries: ['/no-access'] }),
})

const meta: Meta<typeof NoAccessPage> = {
  title: 'Pages/Auth/NoAccess',
  component: NoAccessPage,
  render: () => <RouterProvider router={router} />,
}
export default meta

type Story = StoryObj<typeof NoAccessPage>

export const Default: Story = {
  args: {},
}
