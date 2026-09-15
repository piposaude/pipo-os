import { describe, expect, it } from 'vitest'
import { isAuthorized, policyMatches, policyString } from './policy.js'

const TICKET = 'admin/allow/administrate/ticket/*'

describe('policyString', () => {
  it('fills the house defaults around the domain', () => {
    expect(policyString({ domain: 'ticket' })).toBe(TICKET)
  })

  it('keeps every part the declaration names', () => {
    expect(
      policyString({
        context: 'system',
        effect: 'allow',
        action: 'read',
        domain: 'ticket',
        specific: '6d1c1f4e',
      }),
    ).toBe('system/allow/read/ticket/6d1c1f4e')
  })
})

describe('policyMatches', () => {
  it('matches a policy the session holds verbatim', () => {
    expect(policyMatches(TICKET, TICKET)).toBe(true)
  })

  it('lets a wildcard the session holds cover a specific resource', () => {
    expect(policyMatches(TICKET, 'admin/allow/administrate/ticket/6d1c1f4e')).toBe(true)
  })

  // The wildcard only widens what the session holds. A requirement asking for
  // every ticket is not satisfied by permission over one of them.
  it('does not let a wildcard in the requirement accept a single resource', () => {
    expect(policyMatches('admin/allow/administrate/ticket/6d1c1f4e', TICKET)).toBe(false)
  })

  it('refuses a policy of another domain', () => {
    expect(policyMatches('admin/allow/administrate/company/*', TICKET)).toBe(false)
  })

  it('refuses a policy that only reads when the route asks to administrate', () => {
    expect(policyMatches('admin/allow/read/ticket/*', TICKET)).toBe(false)
  })

  it('refuses a policy of another context or effect', () => {
    expect(policyMatches('system/allow/administrate/ticket/*', TICKET)).toBe(false)
    expect(policyMatches('admin/deny/administrate/ticket/*', TICKET)).toBe(false)
  })

  // Real policies come in longer shapes, like admin/allow/read/email/hr/company/{uuid}.
  it('refuses a policy longer than the requirement', () => {
    expect(policyMatches('admin/allow/read/email/hr/company/abc', TICKET)).toBe(false)
  })

  // What the shared Clojure interceptor does: the parts the session states have
  // to match, and the ones it leaves out are not asked about. This is how the
  // house grants total access, so refusing it would 403 every Pipo admin.
  it('accepts a shorter policy on its prefix, the way the house does', () => {
    expect(policyMatches('admin/allow/*/*', TICKET)).toBe(true)
    expect(policyMatches('admin/allow/administrate/ticket', TICKET)).toBe(true)
    expect(policyMatches('admin/allow/*/*', 'admin/allow/administrate/pipodesk/ticket')).toBe(true)
  })

  it('still refuses a shorter policy whose prefix diverges', () => {
    expect(policyMatches('admin/allow/read', TICKET)).toBe(false)
    expect(policyMatches('system/allow', TICKET)).toBe(false)
  })
})

describe('isAuthorized', () => {
  it('accepts a session that holds one of the required policies', () => {
    expect(isAuthorized([TICKET], [{ domain: 'queue' }, { domain: 'ticket' }])).toBe(true)
  })

  it('refuses a session with no policy at all', () => {
    expect(isAuthorized([], [{ domain: 'ticket' }])).toBe(false)
  })

  it('refuses a session holding only policies of other domains', () => {
    expect(
      isAuthorized(
        ['admin/allow/administrate/company/*', 'admin/allow/read/identity/*'],
        [{ domain: 'ticket' }],
      ),
    ).toBe(false)
  })

  // The exclusion pattern the auth-service issues: total access minus one
  // domain. Reading only the allows would hand the route to someone refused.
  it('refuses a session denied the very policy the route requires', () => {
    expect(
      isAuthorized(
        ['admin/allow/administrate/pipodesk/*', 'admin/deny/administrate/pipodesk/ticket'],
        [{ domain: 'pipodesk', specific: 'ticket' }],
      ),
    ).toBe(false)
  })

  // A deny of one alternative refuses the request, not just that alternative.
  it('refuses a route of two alternatives when one of them is denied', () => {
    expect(
      isAuthorized(
        ['admin/allow/administrate/pipodesk/structure', 'admin/deny/administrate/pipodesk/ticket'],
        [
          { domain: 'pipodesk', specific: 'ticket' },
          { domain: 'pipodesk', specific: 'structure' },
        ],
      ),
    ).toBe(false)
  })

  it('leaves a deny of another policy alone', () => {
    expect(
      isAuthorized(
        ['admin/allow/administrate/pipodesk/*', 'admin/deny/administrate/pipodesk/structure'],
        [{ domain: 'pipodesk', specific: 'ticket' }],
      ),
    ).toBe(true)
  })

  // A deny is compared as an exact string, not by the prefix rule that widens
  // an allow: has-denied-policies? swaps the effect and asks a set for the key.
  it('does not let a deny shorter than the requirement block the route', () => {
    expect(
      isAuthorized(
        ['admin/allow/administrate/pipodesk/*', 'admin/deny/administrate/pipodesk'],
        [{ domain: 'pipodesk', specific: 'ticket' }],
      ),
    ).toBe(true)
  })

  it('does not expand a wildcard in a deny', () => {
    expect(
      isAuthorized(
        ['admin/allow/administrate/pipodesk/ticket', 'admin/deny/administrate/pipodesk/*'],
        [{ domain: 'pipodesk', specific: 'ticket' }],
      ),
    ).toBe(true)
  })

  // Neither allow nor deny: the shared interceptor groups by effect and never
  // looks at it, so a wildcard there must not stand in for an allow.
  it('refuses a policy whose effect is a wildcard', () => {
    expect(isAuthorized(['admin/*/administrate/ticket/*'], [{ domain: 'ticket' }])).toBe(false)
  })
})
