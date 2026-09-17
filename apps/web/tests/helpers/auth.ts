import { DESK_POLICIES } from '@/lib/policy'

/** The `@/lib/auth` mock a desk screen needs: someone logged in whose session
 *  also reaches Pipodesk, which is what the `_desk` guard requires.
 *
 *  Used through `vi.mock('@/lib/auth', async () => (await import('…')).deskSession())`
 *  — the factory is hoisted, so the import has to happen inside it. Kept here
 *  rather than spelled in each test file: the policies then live in one place,
 *  src/lib/policy.ts. */
export const deskSession = () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(true),
  sessionPolicies: vi.fn().mockReturnValue(DESK_POLICIES),
  logout: vi.fn(),
})
