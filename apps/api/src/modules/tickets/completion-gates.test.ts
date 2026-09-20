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

describe('completionFailures · gate 3, inclusion', () => {
  const snapshotOf = (taxIds: string[], admissionDate?: string) => ({
    member_type: 'primary',
    primary: {
      profile: { tax_id: taxIds[0] },
      ...(admissionDate ? { employment: { admission_date: admissionDate } } : {}),
    },
    dependents: taxIds.slice(1).map((tax_id) => ({ profile: { tax_id } })),
  })

  const inclusionOf = (taxIds: string[], admissionDate?: string) =>
    subjectOf({
      enrollmentType: 'inclusion',
      enrollmentSnapshot: snapshotOf(taxIds, admissionDate),
    })

  const filled = (taxId: string, startDate = '2026-04-01') => ({
    taxId,
    idCardNumber: `card-${taxId}`,
    startDate,
  })

  it('passes when the single life has a card and a start date', () => {
    expect(completionFailures(inclusionOf(['111']), { members: [filled('111')] })).toEqual([])
  })

  it('demands the card of the life that came without one', () => {
    const members = [{ taxId: '111', idCardNumber: '  ', startDate: '2026-04-01' }]
    expect(named(completionFailures(inclusionOf(['111']), { members }))).toEqual([
      'members[111].idCardNumber:required',
    ])
  })

  it('demands the start date, and refuses one that is not YYYY-MM-DD', () => {
    const missing = [{ taxId: '111', idCardNumber: 'card', startDate: '' }]
    expect(named(completionFailures(inclusionOf(['111']), { members: missing }))).toEqual([
      'members[111].startDate:required',
    ])
    const written = [{ taxId: '111', idCardNumber: 'card', startDate: '31/03/2026' }]
    expect(named(completionFailures(inclusionOf(['111']), { members: written }))).toEqual([
      'members[111].startDate:invalid',
    ])
  })

  it('passes with three lives answered', () => {
    const members = [filled('111'), filled('222'), filled('333')]
    expect(completionFailures(inclusionOf(['111', '222', '333']), { members })).toEqual([])
  })

  it('names the life that is missing, not its position', () => {
    const members = [
      filled('111'),
      { taxId: '222', idCardNumber: '', startDate: '2026-04-01' },
      filled('333'),
    ]
    expect(named(completionFailures(inclusionOf(['111', '222', '333']), { members }))).toEqual([
      'members[222].idCardNumber:required',
    ])
  })

  it('answers for every life at once, in the order the snapshot lists them', () => {
    expect(named(completionFailures(inclusionOf(['111', '222', '333']), { members: [] }))).toEqual([
      'members[111].idCardNumber:required',
      'members[111].startDate:required',
      'members[222].idCardNumber:required',
      'members[222].startDate:required',
      'members[333].idCardNumber:required',
      'members[333].startDate:required',
    ])
  })

  it('refuses a tax id the movement does not carry', () => {
    const members = [filled('111'), filled('999')]
    expect(named(completionFailures(inclusionOf(['111']), { members }))).toEqual([
      'members[999]:unknown_member',
    ])
  })

  it('asks only for the dependent when the movement is of one dependent', () => {
    const subject = subjectOf({
      enrollmentType: 'inclusion',
      enrollmentSnapshot: {
        member_type: 'dependent',
        member_id: 'm1',
        primary: { profile: { tax_id: '111' } },
        dependents: [{ member_id: 'm1', profile: { tax_id: '222' } }],
      },
    })
    expect(named(completionFailures(subject, { members: [] }))).toEqual([
      'members[222].idCardNumber:required',
      'members[222].startDate:required',
    ])
  })

  it('refuses an inclusion whose snapshot shows no life to answer for', () => {
    const subject = subjectOf({ enrollmentType: 'inclusion', enrollmentSnapshot: {} })
    expect(named(completionFailures(subject, { members: [filled('111')] }))).toEqual([
      'enrollmentSnapshot:unknown_lives',
    ])
  })

  it('accepts a start date exactly one month before the admission', () => {
    const members = [filled('111', '2026-05-01')]
    expect(completionFailures(inclusionOf(['111'], '2026-06-01'), { members })).toEqual([])
  })

  it('refuses a start date earlier than one month before the admission', () => {
    const members = [filled('111', '2026-04-30')]
    expect(named(completionFailures(inclusionOf(['111'], '2026-06-01'), { members }))).toEqual([
      'members[111].startDate:before_admission',
    ])
  })

  it('lets the month subtraction overflow instead of clamping it', () => {
    expect(
      completionFailures(inclusionOf(['111'], '2026-03-31'), {
        members: [filled('111', '2026-03-03')],
      }),
    ).toEqual([])
    expect(
      named(
        completionFailures(inclusionOf(['111'], '2026-03-31'), {
          members: [filled('111', '2026-03-02')],
        }),
      ),
    ).toEqual(['members[111].startDate:before_admission'])
  })

  it('still demands card and start date when the snapshot has no admission', () => {
    expect(
      completionFailures(inclusionOf(['111']), { members: [filled('111', '2020-01-01')] }),
    ).toEqual([])
    expect(named(completionFailures(inclusionOf(['111']), { members: [] }))).toEqual([
      'members[111].idCardNumber:required',
      'members[111].startDate:required',
    ])
  })

  /** Deliberately more permissive than the EI, and only here: the MecSAS rule
   *  is the PD-031d, and this breaks the day it lands. */
  it('completes a PJ inclusion at sulamerica without the carrier company code', () => {
    const subject = subjectOf({
      enrollmentType: 'inclusion',
      enrollmentSnapshot: {
        ...snapshotOf(['111']),
        'carrier-system-alias': 'sulamerica',
        primary: {
          profile: { tax_id: '111' },
          employment: { contract_type: 'services-contract' },
        },
      },
    })
    expect(completionFailures(subject, { members: [filled('111')] })).toEqual([])
  })

  it('answers the wrong status and two unanswered lives in a single call', () => {
    const subject = subjectOf({
      enrollmentType: 'inclusion',
      status: 'broker-processing',
      enrollmentSnapshot: snapshotOf(['111', '222']),
    })
    const members = [
      { taxId: '111', idCardNumber: '', startDate: '2026-04-01' },
      { taxId: '222', idCardNumber: '', startDate: '2026-04-01' },
    ]
    expect(named(completionFailures(subject, { members }))).toEqual([
      'status:invalid_status',
      'members[111].idCardNumber:required',
      'members[222].idCardNumber:required',
    ])
  })
})
