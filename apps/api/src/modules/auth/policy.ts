/** A Pipo access policy, in the five parts the auth-service issues:
 *  `{context}/{effect}/{action}/{domain}/{specific}`. Only the domain has no
 *  sensible default. */
export interface PolicyRequirement {
  context?: string
  effect?: string
  action?: string
  domain: string
  specific?: string
}

/** The door to every ticket route, wherever it lives — the queue module serves
 *  them too. Not domain `ticket`: that is the ticket-service's admin role. */
export const TICKET_POLICY: PolicyRequirement = { domain: 'pipodesk', specific: 'ticket' }

/** Pods, their members and the saved queues — one door for both modules, so
 *  neither imports the other. `pipodesk/*` covers it and the tickets. */
export const STRUCTURE_POLICY: PolicyRequirement = { domain: 'pipodesk', specific: 'structure' }

export function policyString(requirement: PolicyRequirement): string {
  const {
    context = 'admin',
    effect = 'allow',
    action = 'administrate',
    domain,
    specific = '*',
  } = requirement

  return [context, effect, action, domain, specific].join('/')
}

/** A route's `policy` config as a list, whichever shape it was declared in. */
export function requiredPolicies(
  declared: PolicyRequirement | PolicyRequirement[],
): PolicyRequirement[] {
  return Array.isArray(declared) ? declared : [declared]
}

const effectOf = (policy: string): string | undefined => policy.split('/')[1]

/** The effect swapped for `allow`, to compare a deny against a requirement. */
const asAllow = (policy: string): string => {
  const parts = policy.split('/')
  parts[1] = 'allow'
  return parts.join('/')
}

// Mirrors match-policy in com.piposaude.interceptors.auth.token: a held policy
// shorter than the requirement matches on its prefix, never the other way.
export function policyMatches(held: string, required: string): boolean {
  const heldParts = held.split('/')
  const requiredParts = required.split('/')

  if (heldParts.length > requiredParts.length) {
    return false
  }

  return heldParts.every((part, index) => part === '*' || part === requiredParts[index])
}

export function isAuthorized(policies: string[], required: PolicyRequirement[]): boolean {
  const wanted = required.map(policyString)

  // A deny naming ANY of the required policies refuses the whole request, even
  // when another alternative is allowed — has-denied-policies? in token.clj.
  const denied = new Set(policies.filter((held) => effectOf(held) === 'deny').map(asAllow))
  if (wanted.some((policy) => denied.has(policy))) {
    return false
  }

  const allowed = policies.filter((held) => effectOf(held) === 'allow')
  return wanted.some((policy) => allowed.some((held) => policyMatches(held, policy)))
}
