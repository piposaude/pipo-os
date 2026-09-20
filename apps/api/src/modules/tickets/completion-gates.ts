/** Pure by contract: the block and the movement arrive as arguments, so
 *  nothing here may read the database or the request. */

import type { ErrorDetail } from '../../shared/errors.js'
import { completionContextOf } from './enrollment-snapshot.js'
import type { CanonicalEnrollmentType } from './enrollment-type.js'
import type { TicketStatus } from './schemas.js'

export interface CompletionMember {
  readonly taxId: string
  readonly idCardNumber: string
  readonly startDate: string
}

export interface CompletionData {
  readonly members?: readonly CompletionMember[]
  readonly endDate?: string
  readonly effectiveDate?: string
  readonly mecsasCompanyCode?: string
  readonly hasGracePeriod?: boolean
  readonly carrierTrackingNumber?: string
  readonly documentTypes?: string[]
}

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

/** The round trip is what refuses `2026-02-31`: the shape alone accepts any
 *  two digits, and a rolled-over date would close the ticket on a lie. */
function isCompletionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

/** The join key of this module: the snapshot writes the CPF punctuated and the
 *  body writes it bare, so only the digits can decide that it is the same life. */
const digitsOf = (taxId: string): string => taxId.replace(/\D/g, '')

/** The EI writes the admission as a timestamp as often as a date
 *  (`formatDateDMY`), and one we cannot read must not refuse a completion. */
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

/** The overflow is not clamped, as in the EI's `AddDate(0, -1, 0)`: one month
 *  before 31/03 is 03/03, not 28/02. */
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

  const failures: ErrorDetail[] = []
  // A life with no digits cannot be named in a failure, and two of them would
  // collapse into one — so it is refused here, not asked for a card.
  if (lives.length === 0 || digits.some((taxId) => taxId === '')) {
    failures.push({
      field: 'enrollmentSnapshot',
      message: 'The movement carries a life this API cannot identify by tax id',
      code: 'unknown_lives',
    })
  }
  if (lives.length === 0) return failures

  // Keeps the first answer for a life: a later duplicate must not erase a
  // blank card the gate already refused.
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

  const carried = new Set(lives)
  for (const member of members) {
    const taxId = digitsOf(member.taxId)
    if (!carried.has(taxId)) {
      failures.push({
        field: `members[${taxId}]`,
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
