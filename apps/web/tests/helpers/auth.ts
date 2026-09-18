import { DESK_POLICIES } from '@/lib/policy'

/** The `@/lib/auth` mock a desk screen needs: authenticated and holding the
 *  policies the `_desk` guard requires.
 *
 *  Used as `vi.mock('@/lib/auth', async () => (await import('…')).deskSession())`
 *  — the factory is hoisted, so the import has to happen inside it. */
export const deskSession = () => ({
  ensureSession: vi.fn().mockResolvedValue(undefined),
  isAuthenticated: vi.fn().mockReturnValue(true),
  sessionPolicies: vi.fn().mockReturnValue(DESK_POLICIES),
  logout: vi.fn().mockResolvedValue(undefined),
})
