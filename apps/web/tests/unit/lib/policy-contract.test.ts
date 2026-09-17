// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DESK_POLICIES, isAuthorized } from '@/lib/policy'

/** Twin of apps/api's auth/policy.contract.test.ts: change one, change both.
 *
 *  The matcher lives twice — here and in apps/api/src/modules/auth/policy.ts —
 *  and the front-end copy exists so the route guard can decide without a round
 *  trip. Two copies with nothing tying them is how the guard drifts into
 *  refusing a session the API admits, which is worse than no guard: this file
 *  is what makes the drift fail a build instead of a person's morning. */
const POLICY_PATH = fileURLToPath(
  new URL('../../../../../contract/pipodesk-policies.json', import.meta.url),
)

interface MatchCase {
  why: string
  held: string[]
  required: ('ticket' | 'structure')[]
  authorized: boolean
}

const { deskPolicies, matchCases } = JSON.parse(readFileSync(POLICY_PATH, 'utf-8')) as {
  deskPolicies: { ticket: string; structure: string }
  matchCases: MatchCase[]
}

describe('the Pipodesk policy contract', () => {
  it('should carry the two doors the API requires, in the order the guard asks them', () => {
    expect(DESK_POLICIES).toEqual([deskPolicies.ticket, deskPolicies.structure])
  })

  it.each(matchCases)('should agree with the API: $why', ({ held, required, authorized }) => {
    expect(
      isAuthorized(
        held,
        required.map((door) => deskPolicies[door]),
      ),
    ).toBe(authorized)
  })
})
