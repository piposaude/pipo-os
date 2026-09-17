import { DESK_POLICIES, hasDeskAccess, isAuthorized } from '@/lib/policy'

const TICKET = 'admin/allow/administrate/pipodesk/ticket'
const STRUCTURE = 'admin/allow/administrate/pipodesk/structure'

describe('isAuthorized', () => {
  it('should let in a session holding exactly the required policy', () => {
    expect(isAuthorized([TICKET], [TICKET])).toBe(true)
  })

  it('should refuse a session with no policy at all', () => {
    expect(isAuthorized([], [TICKET])).toBe(false)
  })

  it('should refuse a policy of another domain', () => {
    expect(isAuthorized(['admin/allow/administrate/enrollment/*'], [TICKET])).toBe(false)
  })

  // The API matches a held policy against the requirement by prefix, so a
  // broad admin reaches Pipodesk without anyone naming it. The front-end has
  // to agree: barring someone the API lets through is worse than the bug this
  // guard fixes.
  it.each([
    ['admin/allow/*', 'the whole admin context'],
    ['admin/allow/administrate/*', 'every domain'],
    ['admin/allow/administrate/pipodesk/*', 'the whole Pipodesk domain'],
  ])('should let in the wildcard %s, which covers %s', (held) => {
    expect(isAuthorized([held], [TICKET])).toBe(true)
  })

  it('should refuse a held policy longer than the requirement, which never matches', () => {
    expect(isAuthorized([`${TICKET}/extra`], [TICKET])).toBe(false)
  })

  it('should refuse a deny of the required policy, despite a broad allow', () => {
    expect(
      isAuthorized(['admin/allow/*', 'admin/deny/administrate/pipodesk/ticket'], [TICKET]),
    ).toBe(false)
  })

  // has-denied-policies? in token.clj, and the reason hasDeskAccess below asks
  // one door at a time: given several alternatives, a deny of any single one
  // refuses the whole call, even when another alternative is allowed.
  it('should refuse when any one of several alternatives is denied', () => {
    const held = ['admin/allow/*', 'admin/deny/administrate/pipodesk/ticket']

    expect(isAuthorized(held, [TICKET, STRUCTURE])).toBe(false)
  })
})

describe('hasDeskAccess', () => {
  it('should let in a session holding the ticket policy', () => {
    expect(hasDeskAccess([TICKET])).toBe(true)
  })

  it('should let in a session holding only the structure policy', () => {
    expect(hasDeskAccess([STRUCTURE])).toBe(true)
  })

  it('should refuse a session with no policy at all', () => {
    expect(hasDeskAccess([])).toBe(false)
  })

  it('should refuse a session whose policies are all of other domains', () => {
    expect(hasDeskAccess(['admin/allow/administrate/enrollment/*'])).toBe(false)
  })

  it('should let in a wildcard broad enough to cover Pipodesk', () => {
    expect(hasDeskAccess(['admin/allow/*'])).toBe(true)
  })

  // Each door is asked on its own: the API requires one policy per route, so
  // someone denied the tickets still reaches the structure screens. Asking for
  // both at once would refuse this session, which the API does not.
  it('should let in when one door is denied and the other is allowed', () => {
    expect(hasDeskAccess([STRUCTURE, 'admin/deny/administrate/pipodesk/ticket'])).toBe(true)
  })

  it('should refuse when a deny covers both doors', () => {
    const held = [
      'admin/allow/*',
      'admin/deny/administrate/pipodesk/ticket',
      'admin/deny/administrate/pipodesk/structure',
    ]

    expect(hasDeskAccess(held)).toBe(false)
  })
})

describe('DESK_POLICIES', () => {
  // These two strings are the contract with apps/api/src/modules/auth/policy.ts:
  // spelled differently here, the guard would refuse everyone the API admits.
  it('should be the two doors every Pipodesk route requires', () => {
    expect(DESK_POLICIES).toEqual([TICKET, STRUCTURE])
  })
})
