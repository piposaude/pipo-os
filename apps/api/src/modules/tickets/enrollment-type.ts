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
  // Own keys only, as `vocabulary.ts` does: the types say a word got here
  // through the schema, and a caller that skips it must not read `constructor`
  // off the prototype and write a function to the column.
  if (!alterationType || !Object.prototype.hasOwnProperty.call(OF_ALTERATION, alterationType)) {
    return null
  }
  return OF_ALTERATION[alterationType]
}

/** The snapshot's word, if it is one we know; anything else reads as absent.
 *  Folded like the body's, because the snapshot is the EI's payload verbatim. */
export function parseAlterationType(value: string | null): AlterationType | null {
  const parsed = alterationTypeSchema.safeParse(value?.toLowerCase() ?? null)
  return parsed.success ? parsed.data : null
}

/**
 * Lowercases the two words before the enum sees them. The EI compares both with
 * `EqualFold` — `request_type` in `enrollment.go:432`, `alteration_type` in
 * `:332` — so the case it forwards is not stable, and refusing `Alteration`
 * would cost a whole ticket over a letter. It is the same fold `relationshipOf`
 * applies to `member-type`.
 *
 * It runs before validation, not inside the schema: wrapping the enum in a
 * `preprocess` makes the exported contract drop `enrollmentType` from
 * `required`, and a required field turning optional in the generated client is
 * a worse bug than the one being fixed. The published vocabulary stays lowercase.
 */
export function foldEnrollmentWords(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body

  const folded: Record<string, unknown> = { ...(body as Record<string, unknown>) }
  for (const key of ['enrollmentType', 'alterationType']) {
    const value = folded[key]
    if (typeof value === 'string') folded[key] = value.toLowerCase()
  }
  return folded
}
