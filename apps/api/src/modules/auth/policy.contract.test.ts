import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  STRUCTURE_POLICY,
  TICKET_POLICY,
  isAuthorized,
  policyString,
  type PolicyRequirement,
} from './policy.js'

/** Twin of apps/web's policy-contract.test.ts: change one, change both.
 *
 *  The web app carries its own copy of this matcher, so its route guard can
 *  decide without asking the API. This file is the other half of what keeps
 *  the two from drifting — a policy renamed here alone turns the guard
 *  stricter than the routes it is guarding. */
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

const DOORS: Record<Door, PolicyRequirement> = {
  ticket: TICKET_POLICY,
  structure: STRUCTURE_POLICY,
}

describe('the Pipodesk policy contract', () => {
  // Every door the contract names, not two by hand: a door added there and
  // never mapped here would leave this half of the twin silently untested.
  it('spells every door the way the web app expects to read them', () => {
    expect(Object.keys(deskPolicies).sort()).toEqual(Object.keys(DOORS).sort())
    for (const [door, policy] of Object.entries(deskPolicies)) {
      expect(policyString(DOORS[door as Door])).toBe(policy)
    }
  })

  it.each(matchCases)('agrees with the web app: $why', ({ held, required, authorized }) => {
    expect(
      isAuthorized(
        held,
        required.map((door) => DOORS[door]),
      ),
    ).toBe(authorized)
  })
})
