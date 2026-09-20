/** Pure by contract: the block and the movement arrive as arguments, so
 *  nothing here may read the database or the request. */

import type { ErrorDetail } from '../../shared/errors.js'
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
