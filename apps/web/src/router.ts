import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

// Standalone SPA: browser history (default). Hash history is exclusive to
// the single-spa MFEs, where the shell owns the pathname.
export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
