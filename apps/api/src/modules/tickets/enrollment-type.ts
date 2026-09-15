/**
 * The type of the movement, translated at the door. The EI says what happened
 * in two words — `request_type` and, for an alteration, `alteration_type` — and
 * the queue knows one word per type. `plan_change` and `registration_data_change`
 * do not exist on the EI's side: the pairing is ours, and it happens on write so
 * the column never holds `alteration`, which the Type filter matches literally.
 */

import { z } from 'zod'

/** The queue's vocabulary. `combined_change` is the fifth word, for the EI's
 *  `combined` (MR !126): folding it into `plan_change` would lie about what
 *  moved, refusing it would break a producer already in production. */
export const CANONICAL_ENROLLMENT_TYPES = [
  'inclusion',
  'exclusion',
  'plan_change',
  'registration_data_change',
  'combined_change',
] as const

export const canonicalEnrollmentTypeSchema = z.enum(CANONICAL_ENROLLMENT_TYPES)

export type CanonicalEnrollmentType = z.infer<typeof canonicalEnrollmentTypeSchema>

/** What a body may say: the canonical words plus `alteration`, the EI's own
 *  request_type, which only becomes a word of ours next to an alterationType.
 *  The cost, on purpose: a request_type the EI adds tomorrow is a 400 here and
 *  needs a deploy of this API, instead of reaching a row raw. `cancellation`
 *  and `exclusion-with-extension-plan` have a label in the EI and never open
 *  a ticket, so their absence is documentation. */
export const incomingEnrollmentTypeSchema = z.enum([...CANONICAL_ENROLLMENT_TYPES, 'alteration'])

export type IncomingEnrollmentType = z.infer<typeof incomingEnrollmentTypeSchema>

/** The EI's alteration_type. `registration-data` is the alias of producers
 *  built against enrollment-core-api < 60; the EI folds it before it reaches
 *  anyone, so here it is a safety net for a snapshot written before that. */
export const alterationTypeSchema = z.enum([
  'plan',
  'registration',
  'registration-data',
  'combined',
])

export type AlterationType = z.infer<typeof alterationTypeSchema>

const OF_ALTERATION: Record<AlterationType, CanonicalEnrollmentType> = {
  plan: 'plan_change',
  registration: 'registration_data_change',
  'registration-data': 'registration_data_change',
  combined: 'combined_change',
}

/** A canonical word passes through, whatever came next to it; `alteration`
 *  needs its alterationType and is `null` without one, for the caller to
 *  refuse by name. */
export function canonicalEnrollmentType(
  type: IncomingEnrollmentType,
  alterationType: AlterationType | null | undefined,
): CanonicalEnrollmentType | null {
  if (type !== 'alteration') return type
  return alterationType ? OF_ALTERATION[alterationType] : null
}

/** The snapshot's word, if it is one we know; anything else reads as absent. */
export function parseAlterationType(value: string | null): AlterationType | null {
  const parsed = alterationTypeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
