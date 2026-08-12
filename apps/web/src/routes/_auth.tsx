import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '@/lib/auth'

// Pathless layout guarding every protected route. The login issue will turn
// the stub in lib/auth into a real session check and redirect unauthenticated
// visitors to the public login route.
export const Route = createFileRoute('/_auth')({
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw new Error('Unauthenticated')
    }
  },
})
