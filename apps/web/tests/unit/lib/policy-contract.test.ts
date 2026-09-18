// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DESK_POLICIES, isAuthorized } from '@/lib/policy'

/** Twin of apps/api's auth/policy.contract.test.ts: change one, change both.
 *  The matcher lives twice — here and in apps/api/src/modules/auth/policy.ts —
 *  so the route guard can decide without a round trip. This file makes a drift
 *  between the copies fail a build. */
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
  // The set, not the sequence: hasDeskAccess asks each door on its own, but a
  // door missing from DESK_POLICIES is one the guard never asks about.
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
