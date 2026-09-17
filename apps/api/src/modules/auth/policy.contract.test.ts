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

const DOORS: Record<'ticket' | 'structure', PolicyRequirement> = {
  ticket: TICKET_POLICY,
  structure: STRUCTURE_POLICY,
}

describe('the Pipodesk policy contract', () => {
  it('spells the two doors the way the web app expects to read them', () => {
    expect(policyString(TICKET_POLICY)).toBe(deskPolicies.ticket)
    expect(policyString(STRUCTURE_POLICY)).toBe(deskPolicies.structure)
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
