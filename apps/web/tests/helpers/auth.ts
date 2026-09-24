import { DESK_POLICIES } from '@/lib/policy'
import { useSessionStore } from '@/stores/session'
import { FIXTURE_USER_NAMES, VIEWER_GROUP_ID, VIEWER_ID } from '../fixtures/pipodesk/dataset'

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

export function signInAsFixtureViewer(): void {
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      sub: VIEWER_ID,
      email: 'analista@piposaude.com.br',
      name: FIXTURE_USER_NAMES[VIEWER_ID] ?? null,
      policies: [...DESK_POLICIES],
      groups: [{ groupId: VIEWER_GROUP_ID, role: 'member' }],
    },
  })
}
