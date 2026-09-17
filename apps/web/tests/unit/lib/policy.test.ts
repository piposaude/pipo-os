import { hasDeskAccess } from '@/lib/policy'

// The matcher underneath is held to the API by policy-contract.test.ts, against
// the shared case table. What is left here is the question only the front-end
// asks: does this session reach Pipodesk at all?
const TICKET = 'admin/allow/administrate/pipodesk/ticket'
const STRUCTURE = 'admin/allow/administrate/pipodesk/structure'

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
  // someone denied the tickets still reaches the structure screens.
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
