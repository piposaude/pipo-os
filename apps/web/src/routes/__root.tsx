import { useState } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export const Route = createRootRoute({
  component: function Root() {
    const [queryClient] = useState(() => new QueryClient())

    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    )
  },
})
