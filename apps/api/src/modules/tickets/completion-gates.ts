import type { ErrorDetail } from '../../shared/errors.js'
import { digitsOf } from '../../shared/text.js'
import { completionContextOf, snapshotLivesOf } from './enrollment-snapshot.js'
import type { CanonicalEnrollmentType } from './enrollment-type.js'
import type { TicketCompletionBody, TicketStatus } from './schemas.js'

export type CompletionData = TicketCompletionBody
export type CompletionMember = NonNullable<CompletionData['members']>[number]

export interface CompletionSubject {
  readonly enrollmentType: CanonicalEnrollmentType
  readonly status: TicketStatus
  readonly forceCompletion: boolean
  readonly enrollmentSnapshot: unknown
}

export const COMPLETABLE_FROM: ReadonlySet<TicketStatus> = new Set([
  'carrier-processing',
  'missing-documents',
  'broker-open-issue',
  'incorrect-data',
])

const EXEMPT: ReadonlySet<CanonicalEnrollmentType> = new Set([
  'registration_data_change',
  'combined_change',
])

function isCompletionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function snapshotDate(written: string | null): string | null {
  const value = written?.trim().slice(0, 10) ?? ''
  return isCompletionDate(value) ? value : null
}

function dateFailure(
  field: string,
  label: string,
  written: string | undefined,
): ErrorDetail | null {
  const value = written?.trim() ?? ''
  if (value === '') {
    return { field, message: `${label} is required to complete the ticket`, code: 'required' }
  }
  if (!isCompletionDate(value)) {
    return { field, message: `${label} must be a real date written as YYYY-MM-DD`, code: 'invalid' }
  }
  return null
}

function oneMonthBefore(date: string): string {
  const floor = new Date(`${date}T00:00:00Z`)
  floor.setUTCMonth(floor.getUTCMonth() - 1)
  return floor.toISOString().slice(0, 10)
}

function inclusionFailures(
  subject: CompletionSubject,
  members: readonly CompletionMember[],
): ErrorDetail[] {
  const { memberTaxIds, admissionDate } = completionContextOf(subject.enrollmentSnapshot)
  const digits = memberTaxIds.map(digitsOf)
  const lives = [...new Set(digits)].filter((taxId) => taxId !== '')
  const unreadable = digits.some((taxId) => taxId === '')

  const failures: ErrorDetail[] = []
  if (lives.length === 0 || unreadable) {
    failures.push({
      field: 'enrollmentSnapshot',
      message: 'The movement carries a life this API cannot identify by tax id',
      code: 'unknown_lives',
    })
  }
  if (lives.length === 0) return failures

  const answered = new Map<string, CompletionMember>()
  for (const member of members) {
    const taxId = digitsOf(member.taxId)
    if (!answered.has(taxId)) answered.set(taxId, member)
  }

  const admission = snapshotDate(admissionDate)
  const floor = admission === null ? null : oneMonthBefore(admission)

  for (const taxId of lives) {
    const answer = answered.get(taxId)
    if ((answer?.idCardNumber ?? '').trim() === '') {
      failures.push({
        field: `members[${taxId}].idCardNumber`,
        message: 'The card number is required to complete an inclusion',
        code: 'required',
      })
    }

    const field = `members[${taxId}].startDate`
    const startDate = answer?.startDate.trim() ?? ''
    const invalid = dateFailure(field, 'The start date', startDate)
    if (invalid) {
      failures.push(invalid)
    } else if (floor !== null && startDate < floor) {
      failures.push({
        field,
        message: 'The start date cannot be earlier than one month before the admission',
        code: 'before_admission',
      })
    }
  }

  return failures
}

export function unknownMemberFailures(
  enrollmentSnapshot: unknown,
  members: readonly CompletionMember[],
): ErrorDetail[] {
  const carried = snapshotLivesOf(enrollmentSnapshot).map((taxId) => digitsOf(taxId ?? ''))
  if (carried.length === 0 || carried.includes('')) return []

  const lives = new Set(carried)
  const reported = new Set<string>()
  const failures: ErrorDetail[] = []
  for (const member of members) {
    const taxId = digitsOf(member.taxId)
    if (lives.has(taxId)) continue
    const label = taxId === '' ? member.taxId.trim() : taxId
    if (reported.has(label)) continue
    reported.add(label)
    failures.push({
      field: label === '' ? 'members' : `members[${label}]`,
      message: 'This tax id is not one of the lives the movement carries',
      code: 'unknown_member',
    })
  }
  return failures
}

export function completionFailures(
  subject: CompletionSubject,
  completion: CompletionData | undefined,
): ErrorDetail[] {
  const strangers = unknownMemberFailures(subject.enrollmentSnapshot, completion?.members ?? [])
  if (subject.forceCompletion || EXEMPT.has(subject.enrollmentType)) return strangers

  const failures: ErrorDetail[] = []

  if (!COMPLETABLE_FROM.has(subject.status)) {
    failures.push({
      field: 'status',
      message: `A ticket in ${subject.status} cannot be completed`,
      code: 'invalid_status',
    })
  }

  if (subject.enrollmentType === 'exclusion') {
    const failure = dateFailure('endDate', 'The end date', completion?.endDate)
    if (failure) failures.push(failure)
  }

  if (subject.enrollmentType === 'inclusion') {
    failures.push(...inclusionFailures(subject, completion?.members ?? []))
  }

  if (subject.enrollmentType === 'plan_change') {
    const failure = dateFailure(
      'effectiveDate',
      'The new effective date',
      completion?.effectiveDate,
    )
    if (failure) failures.push(failure)
  }

  return [...failures, ...strangers]
}
