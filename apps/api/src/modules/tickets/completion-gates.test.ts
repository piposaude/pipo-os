import { describe, expect, it } from 'vitest'
import type { ErrorDetail } from '../../shared/errors.js'
import {
  completionFailures,
  type CompletionData,
  type CompletionSubject,
} from './completion-gates.js'

const subjectOf = (over: Partial<CompletionSubject> = {}): CompletionSubject => ({
  enrollmentType: 'exclusion',
  status: 'carrier-processing',
  forceCompletion: false,
  enrollmentSnapshot: {},
  ...over,
})

const named = (failures: ErrorDetail[]): string[] =>
  failures.map((failure) => `${failure.field}:${failure.code}`)

const ENDED: CompletionData = { endDate: '2026-04-30' }

describe('completionFailures · gate 1, the exemptions', () => {
  it('asks nothing of a ticket the analyst forced', () => {
    expect(completionFailures(subjectOf({ forceCompletion: true }), undefined)).toEqual([])
  })

  it('asks nothing of a registration data change, not even a status it could close from', () => {
    const subject = subjectOf({
      enrollmentType: 'registration_data_change',
      status: 'broker-processing',
    })
    expect(completionFailures(subject, undefined)).toEqual([])
  })

  it('asks nothing of a combined change', () => {
    expect(completionFailures(subjectOf({ enrollmentType: 'combined_change' }), undefined)).toEqual(
      [],
    )
  })
})

describe('completionFailures · gate 2, the status it closes from', () => {
  it.each(['carrier-processing', 'missing-documents', 'broker-open-issue', 'incorrect-data'])(
    'closes from %s',
    (status) => {
      expect(
        completionFailures(subjectOf({ status } as Partial<CompletionSubject>), ENDED),
      ).toEqual([])
    },
  )

  it.each(['broker-processing', 'submitted-cancellation'])('does not close from %s', (status) => {
    expect(
      named(completionFailures(subjectOf({ status } as Partial<CompletionSubject>), ENDED)),
    ).toEqual(['status:invalid_status'])
  })

  it('does not stop at the status: the missing fields come out in the same answer', () => {
    const failures = completionFailures(subjectOf({ status: 'broker-processing' }), undefined)
    expect(named(failures)).toEqual(['status:invalid_status', 'endDate:required'])
  })
})

describe('completionFailures · gate 3, exclusion', () => {
  it('passes with an end date', () => {
    expect(completionFailures(subjectOf(), ENDED)).toEqual([])
  })

  it('demands the end date', () => {
    expect(named(completionFailures(subjectOf(), undefined))).toEqual(['endDate:required'])
    expect(named(completionFailures(subjectOf(), { endDate: '  ' }))).toEqual(['endDate:required'])
  })

  it('refuses the DD/MM/YYYY the Zendesk form accepts', () => {
    expect(named(completionFailures(subjectOf(), { endDate: '30/04/2026' }))).toEqual([
      'endDate:invalid',
    ])
  })

  it('refuses a date that is well formed and does not exist', () => {
    expect(named(completionFailures(subjectOf(), { endDate: '2026-02-31' }))).toEqual([
      'endDate:invalid',
    ])
  })

  it('ignores a field the movement does not ask for', () => {
    const completion = { ...ENDED, members: [{ taxId: '111', idCardNumber: '', startDate: '' }] }
    expect(completionFailures(subjectOf(), completion)).toEqual([])
  })
})

describe('completionFailures · gate 3, plan change', () => {
  const planChange = subjectOf({ enrollmentType: 'plan_change' })

  it('passes with the new effective date', () => {
    expect(completionFailures(planChange, { effectiveDate: '2026-05-01' })).toEqual([])
  })

  it('demands the new effective date', () => {
    expect(named(completionFailures(planChange, undefined))).toEqual(['effectiveDate:required'])
    expect(named(completionFailures(planChange, { effectiveDate: '01/05/2026' }))).toEqual([
      'effectiveDate:invalid',
    ])
  })

  it('does not demand the end date of an exclusion', () => {
    expect(completionFailures(planChange, { effectiveDate: '2026-05-01', endDate: '' })).toEqual([])
  })
})

describe('completionFailures · the failure a person reads', () => {
  it('names the field and carries a message of its own', () => {
    const [failure] = completionFailures(subjectOf(), undefined)
    expect(failure).toMatchObject({ field: 'endDate', code: 'required' })
    expect(failure?.message).toMatch(/end date/i)
  })
})
