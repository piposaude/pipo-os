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

type Door = 'ticket' | 'structure'

interface MatchCase {
  why: string
  held: string[]
  required: Door[]
  authorized: boolean
}

const { deskPolicies, matchCases } = JSON.parse(readFileSync(POLICY_PATH, 'utf-8')) as {
  deskPolicies: Record<Door, string>
  matchCases: MatchCase[]
}

describe('the Pipodesk policy contract', () => {
  // The set, not the sequence: a door added to the contract and not to
  // DESK_POLICIES is a door the route guard never asks about, while the order
  // of two doors means nothing — hasDeskAccess asks each on its own.
  it('should carry every door the contract declares', () => {
    expect([...DESK_POLICIES].sort()).toEqual(Object.values(deskPolicies).sort())
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
