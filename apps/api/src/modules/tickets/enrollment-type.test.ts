import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ENROLLMENT_TYPES,
  canonicalEnrollmentType,
  incomingEnrollmentTypeSchema,
  parseAlterationType,
} from './enrollment-type.js'

describe('canonicalEnrollmentType', () => {
  it.each([
    ['plan', 'plan_change'],
    ['registration', 'registration_data_change'],
    ['registration-data', 'registration_data_change'],
    ['combined', 'combined_change'],
  ] as const)('turns alteration + %s into %s', (alterationType, expected) => {
    expect(canonicalEnrollmentType('alteration', alterationType)).toBe(expected)
  })

  it('is null for an alteration that does not say what changed', () => {
    expect(canonicalEnrollmentType('alteration', null)).toBeNull()
    expect(canonicalEnrollmentType('alteration', undefined)).toBeNull()
  })

  it.each(CANONICAL_ENROLLMENT_TYPES)('passes %s through untouched', (type) => {
    expect(canonicalEnrollmentType(type, null)).toBe(type)
  })

  /** The body may carry both; only `alteration` is ambiguous enough to read
   *  the second field. */
  it('ignores the alterationType next to a word that is already canonical', () => {
    expect(canonicalEnrollmentType('inclusion', 'plan')).toBe('inclusion')
    expect(canonicalEnrollmentType('plan_change', 'registration')).toBe('plan_change')
  })
})

describe('parseAlterationType', () => {
  it.each(['plan', 'registration', 'registration-data', 'combined'])('accepts %s', (word) => {
    expect(parseAlterationType(word)).toBe(word)
  })

  it('is null for a word the EI does not emit, and for nothing at all', () => {
    expect(parseAlterationType('cnpj')).toBeNull()
    expect(parseAlterationType('')).toBeNull()
    expect(parseAlterationType(null)).toBeNull()
  })
})

describe('incomingEnrollmentTypeSchema', () => {
  it('accepts the canonical words and the alteration the EI emits', () => {
    for (const word of [...CANONICAL_ENROLLMENT_TYPES, 'alteration']) {
      expect(incomingEnrollmentTypeSchema.safeParse(word).success).toBe(true)
    }
  })

  /** The two the EI has a label for and never opens a ticket about. */
  it.each(['cancellation', 'exclusion-with-extension-plan', 'Inclusion', ''])(
    'refuses %s',
    (word) => {
      expect(incomingEnrollmentTypeSchema.safeParse(word).success).toBe(false)
    },
  )
})
