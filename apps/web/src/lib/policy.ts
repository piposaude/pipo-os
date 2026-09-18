// Mirrors the policy semantics of apps/api/src/modules/auth/policy.ts, so the
// route guard can decide without a round trip. A front-end stricter than the
// API would lock out a session the API admits.

/** The two policies Pipodesk routes require, as the API spells them. */
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

/** Whether a session reaches Pipodesk at all — the only authorization question
 *  the front-end decides; what each screen may do stays with the API.
 *
 *  Asks one policy at a time: a route requires a single policy, so a deny of
 *  the tickets still leaves the structure screens open. */
export function hasDeskAccess(held: string[]): boolean {
  return DESK_POLICIES.some((policy) => isAuthorized(held, [policy]))
}

export function isAuthorized(held: string[], required: string[]): boolean {
  // A deny of any required policy refuses the call, even when another
  // alternative is allowed.
  const denied = new Set(held.filter((policy) => effectOf(policy) === 'deny').map(asAllow))
  if (required.some((policy) => denied.has(policy))) {
    return false
  }

  const allowed = held.filter((policy) => effectOf(policy) === 'allow')
  return required.some((policy) => allowed.some((candidate) => policyMatches(candidate, policy)))
}
