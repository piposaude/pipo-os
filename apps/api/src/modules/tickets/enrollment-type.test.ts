import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ENROLLMENT_TYPES,
  type AlterationType,
  canonicalEnrollmentType,
  foldEnrollmentWords,
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

  it('does not read a value off Object.prototype', () => {
    expect(canonicalEnrollmentType('alteration', 'constructor' as AlterationType)).toBeNull()
  })

  it('ignores the alterationType next to a word that is already canonical', () => {
    expect(canonicalEnrollmentType('inclusion', 'plan')).toBe('inclusion')
    expect(canonicalEnrollmentType('plan_change', 'registration')).toBe('plan_change')
  })
})

describe('parseAlterationType', () => {
  it.each(['plan', 'registration', 'registration-data', 'combined'])('accepts %s', (word) => {
    expect(parseAlterationType(word)).toBe(word)
  })

  it.each([
    ['Plan', 'plan'],
    ['COMBINED', 'combined'],
    ['Registration-Data', 'registration-data'],
  ])('reads %s as %s', (written, expected) => {
    expect(parseAlterationType(written)).toBe(expected)
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

  it.each(['Alteration', 'Inclusion', 'PLAN_CHANGE'])('refuses %s unfolded', (word) => {
    expect(incomingEnrollmentTypeSchema.safeParse(word).success).toBe(false)
  })

  it.each(['cancellation', 'exclusion-with-extension-plan', 'inclusao', ''])(
    'refuses %s',
    (word) => {
      expect(incomingEnrollmentTypeSchema.safeParse(word).success).toBe(false)
    },
  )
})

describe('foldEnrollmentWords', () => {
  it('lowercases the two words the enum is about to judge', () => {
    expect(foldEnrollmentWords({ enrollmentType: 'Alteration', alterationType: 'Plan' })).toEqual({
      enrollmentType: 'alteration',
      alterationType: 'plan',
    })
  })

  it('leaves every other field of the body alone', () => {
    const body = { enrollmentType: 'INCLUSION', title: 'Bradesco | ACME | Inclusão - MARIA' }

    expect(foldEnrollmentWords(body)).toEqual({ ...body, enrollmentType: 'inclusion' })
  })

  it('passes through what is not an object to fold, for the schema to refuse', () => {
    expect(foldEnrollmentWords(null)).toBeNull()
    expect(foldEnrollmentWords('alteration')).toBe('alteration')
    expect(foldEnrollmentWords([1])).toEqual([1])
  })

  it('does not invent a key the caller did not send', () => {
    expect(foldEnrollmentWords({ enrollmentType: 'inclusion' })).not.toHaveProperty(
      'alterationType',
    )
  })

  it('leaves a non-string value for the schema to refuse, instead of throwing', () => {
    expect(foldEnrollmentWords({ enrollmentType: 7 })).toEqual({ enrollmentType: 7 })
  })
})
