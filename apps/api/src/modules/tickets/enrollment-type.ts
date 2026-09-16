import { z } from 'zod'

export const CANONICAL_ENROLLMENT_TYPES = [
  'inclusion',
  'exclusion',
  'plan_change',
  'registration_data_change',
  'combined_change',
] as const

export const canonicalEnrollmentTypeSchema = z.enum(CANONICAL_ENROLLMENT_TYPES)

export type CanonicalEnrollmentType = z.infer<typeof canonicalEnrollmentTypeSchema>

/** `alteration` is the EI's own request_type, and only becomes a word of ours
 *  next to an alterationType. */
export const incomingEnrollmentTypeSchema = z.enum([...CANONICAL_ENROLLMENT_TYPES, 'alteration'])

export type IncomingEnrollmentType = z.infer<typeof incomingEnrollmentTypeSchema>

/** `registration-data` is a legacy alias the EI folds before sending, so it
 *  only reaches here from a snapshot written before that. */
export const alterationTypeSchema = z.enum([
  'plan',
  'registration',
  'registration-data',
  'combined',
])

export type AlterationType = z.infer<typeof alterationTypeSchema>

export function canonicalEnrollmentType(
  type: IncomingEnrollmentType,
  alterationType: AlterationType | null | undefined,
): CanonicalEnrollmentType | null {
  if (type !== 'alteration') return type
  switch (alterationType) {
    case 'plan':
      return 'plan_change'
    case 'registration':
    case 'registration-data':
      return 'registration_data_change'
    case 'combined':
      return 'combined_change'
    // A word we do not know is not a plan change: the guess freezes in the
    // column. `alterationTypeSchema.options` is pinned to this list by a test.
    default:
      return null
  }
}

/** A value we do not know reads as absent — a number as much as a word we do
 *  not emit. Surrounding whitespace is not trimmed: ` plan ` is still unknown. */
export function parseAlterationType(value: unknown): AlterationType | null {
  const parsed = alterationTypeSchema.safeParse(
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  return parsed.success ? parsed.data : null
}

/** Runs before validation, not inside the schema: a `preprocess` around the
 *  enum drops `enrollmentType` from the exported contract's `required`. */
export function foldEnrollmentWords(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body

  const folded: Record<string, unknown> = { ...(body as Record<string, unknown>) }
  for (const key of ['enrollmentType', 'alterationType']) {
    const value = folded[key]
    if (typeof value === 'string') folded[key] = value.toLowerCase()
  }
  return folded
}
