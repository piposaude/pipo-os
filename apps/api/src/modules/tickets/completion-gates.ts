/** Pure by contract: the block and the movement arrive as arguments, so
 *  nothing here may read the database or the request. */

import type { ErrorDetail } from '../../shared/errors.js'
import { completionContextOf } from './enrollment-snapshot.js'
import type { CanonicalEnrollmentType } from './enrollment-type.js'
import type { TicketStatus } from './schemas.js'

export interface CompletionMember {
  taxId: string
  idCardNumber: string
  startDate: string
}

export interface CompletionData {
  members?: CompletionMember[]
  endDate?: string
  effectiveDate?: string
  mecsasCompanyCode?: string
  hasGracePeriod?: boolean
  carrierTrackingNumber?: string
  documentTypes?: string[]
}

export interface CompletionSubject {
  enrollmentType: CanonicalEnrollmentType
  status: TicketStatus
  forceCompletion: boolean
  enrollmentSnapshot: unknown
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

/** The round trip is what refuses `2026-02-31`: the shape alone accepts any
 *  two digits, and a rolled-over date would close the ticket on a lie. */
function isCompletionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
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

/** The overflow is not clamped, as in the EI's `AddDate(0, -1, 0)`: one month
 *  before 31/03 is 03/03, not 28/02. */
function oneMonthBefore(date: string): string {
  const floor = new Date(`${date}T00:00:00Z`)
  floor.setUTCMonth(floor.getUTCMonth() - 1)
  return floor.toISOString().slice(0, 10)
}

function inclusionFailures(subject: CompletionSubject, members: CompletionMember[]): ErrorDetail[] {
  const { memberTaxIds, admissionDate } = completionContextOf(subject.enrollmentSnapshot)
  if (memberTaxIds.length === 0) {
    return [
      {
        field: 'enrollmentSnapshot',
        message: 'The movement shows no life to answer for, so the completion cannot be checked',
        code: 'unknown_lives',
      },
    ]
  }

  const answered = new Map(members.map((member) => [member.taxId, member]))
  const floor =
    admissionDate !== null && isCompletionDate(admissionDate) ? oneMonthBefore(admissionDate) : null

  const failures: ErrorDetail[] = []
  for (const taxId of memberTaxIds) {
    const answer = answered.get(taxId)
    if ((answer?.idCardNumber ?? '').trim() === '') {
      failures.push({
        field: `members[${taxId}].idCardNumber`,
        message: 'The card number is required to complete an inclusion',
        code: 'required',
      })
    }

    const field = `members[${taxId}].startDate`
    const invalid = dateFailure(field, 'The start date', answer?.startDate)
    if (invalid) {
      failures.push(invalid)
    } else if (floor !== null && (answer?.startDate.trim() ?? '') < floor) {
      failures.push({
        field,
        message: 'The start date cannot be earlier than one month before the admission',
        code: 'before_admission',
      })
    }
  }

  for (const member of members) {
    if (!memberTaxIds.includes(member.taxId)) {
      failures.push({
        field: `members[${member.taxId}]`,
        message: 'This tax id is not one of the lives the movement carries',
        code: 'unknown_member',
      })
    }
  }

  return failures
}

export function completionFailures(
  subject: CompletionSubject,
  completion: CompletionData | undefined,
): ErrorDetail[] {
  if (subject.forceCompletion || EXEMPT.has(subject.enrollmentType)) return []

  const failures: ErrorDetail[] = []

  // Never returns early: every failure travels in the same answer.
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

  return failures
}
