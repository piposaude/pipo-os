// The policy semantics of apps/api/src/modules/auth/policy.ts, which in turn
// mirrors match-policy in com.piposaude.interceptors.auth.token. Kept faithful
// on purpose: a front-end stricter than the API would lock out a session the
// API admits, which is worse than the screen this guard fixes.

/** The two doors every Pipodesk route requires, as the API spells them. */
export const DESK_POLICIES = [
  'admin/allow/administrate/pipodesk/ticket',
  'admin/allow/administrate/pipodesk/structure',
]

const effectOf = (policy: string): string | undefined => policy.split('/')[1]

const asAllow = (policy: string): string => {
  const parts = policy.split('/')
  parts[1] = 'allow'
  return parts.join('/')
}

// A held policy shorter than the requirement matches on its prefix, never the
// other way: `admin/allow/*` covers Pipodesk without naming it.
function policyMatches(held: string, required: string): boolean {
  const heldParts = held.split('/')
  const requiredParts = required.split('/')

  if (heldParts.length > requiredParts.length) {
    return false
  }

  return heldParts.every((part, index) => part === '*' || part === requiredParts[index])
}

/** Whether a session reaches Pipodesk at all — the question the route guard
 *  asks, and the only one the front-end decides. What each screen and button
 *  may do stays with the API.
 *
 *  One door at a time, never both at once: a route requires a single policy,
 *  so a deny of the tickets leaves the structure screens open, while asking
 *  for both together would refuse that session (see isAuthorized). */
export function hasDeskAccess(held: string[]): boolean {
  return DESK_POLICIES.some((policy) => isAuthorized(held, [policy]))
}

export function isAuthorized(held: string[], required: string[]): boolean {
  // A deny naming any of the required policies refuses the whole request, even
  // when another alternative is allowed.
  const denied = new Set(held.filter((policy) => effectOf(policy) === 'deny').map(asAllow))
  if (required.some((policy) => denied.has(policy))) {
    return false
  }

  const allowed = held.filter((policy) => effectOf(policy) === 'allow')
  return required.some((policy) => allowed.some((candidate) => policyMatches(candidate, policy)))
}
