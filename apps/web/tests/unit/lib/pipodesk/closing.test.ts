// @vitest-environment node
import type { Ticket } from '@pipo-os/api-client'
import {
  EFFECTIVE_KEY,
  END_KEY,
  cardKey,
  closingFields,
  completionBlock,
  completionBodyOf,
  describeMissing,
  fieldLabel,
  missingClosing,
  oneMonthBefore,
  rejectedFields,
  startKey,
} from '@/lib/pipodesk/closing'
import { apiTicket } from '../../../helpers/ticket'

const ANA = '11122233344'
const LEO = '55566677788'

const person = (taxId: string, name: string) => ({ profile: { tax_id: taxId, name } })

const family = (overrides: Record<string, unknown> = {}) => ({
  primary: { ...person(ANA, 'Ana Souza'), employment: { admission_date: '2023-11-22' } },
  dependents: [person(LEO, 'Léo Souza')],
  benefit_data: { requested_start_date: '2023-12-01', requested_end_date: '2024-02-01' },
  alteration_data: [{ requested_start_date: '2024-03-01' }],
  ...overrides,
})

const subject = (enrollmentType: string, overrides: Partial<Ticket> = {}): Ticket =>
  apiTicket({ enrollmentType, enrollmentSnapshot: family(), ...overrides })

const namesakes = (depName: string) =>
  subject('inclusion', {
    enrollmentSnapshot: {
      primary: person('95124484380', 'Daniel Guedes Hoffmann'),
      dependents: [person('21726724033', depName)],
    },
  })

describe('oneMonthBefore', () => {
  it('should walk back one calendar month', () => {
    expect(oneMonthBefore('2023-11-22')).toBe('2023-10-22')
  })

  it('should overshoot a short month exactly as the engine does', () => {
    expect(oneMonthBefore('2024-03-31')).toBe('2024-03-02')
    expect(oneMonthBefore('2023-10-31')).toBe('2023-10-01')
  })
})

describe('closingFields', () => {
  it('should ask a card and a start per life on an inclusion, keyed as the API names the field', () => {
    const fields = closingFields(subject('inclusion'))

    expect(fields.map((field) => field.key)).toEqual([
      `members[${ANA}].idCardNumber`,
      `members[${ANA}].startDate`,
      `members[${LEO}].idCardNumber`,
      `members[${LEO}].startDate`,
    ])
    expect(fields.map((field) => field.key)).toEqual([
      cardKey(ANA),
      startKey(ANA),
      cardKey(LEO),
      startKey(LEO),
    ])
  })

  it('should floor every start at a month before the admission of the holder', () => {
    const fields = closingFields(subject('inclusion'))

    expect(fields.filter((field) => field.kind === 'date').map((field) => field.floor)).toEqual([
      '2023-10-22',
      '2023-10-22',
    ])
    expect(fields[0].floor).toBeUndefined()
  })

  it('should leave the start without a floor when the admission is not a real date', () => {
    const ticket = subject('inclusion', {
      enrollmentSnapshot: family({
        primary: { ...person(ANA, 'Ana Souza'), employment: { admission_date: '2023-02-31' } },
      }),
    })

    expect(closingFields(ticket)[1].floor).toBeUndefined()
  })

  it('should carry the start the HR requested next to each start', () => {
    const fields = closingFields(subject('inclusion'))

    expect(fields[1].requested).toBe('2023-12-01')
    expect(fields[0].requested).toBeUndefined()
  })

  it('should ask a life once when the snapshot carries its tax id twice', () => {
    const ticket = subject('inclusion', {
      enrollmentSnapshot: family({ dependents: [person('111.222.333-44', 'Ana de novo')] }),
    })

    expect(closingFields(ticket).map((field) => field.key)).toEqual([cardKey(ANA), startKey(ANA)])
  })

  it('should name a life in full when another life of the movement answers to the same first name', () => {
    expect(closingFields(namesakes('Daniel Jardim Hoffmann')).map(fieldLabel)).toEqual([
      'Carteirinha · Daniel Guedes Hoffmann',
      'Início da vigência · Daniel Guedes Hoffmann',
      'Carteirinha · Daniel Jardim Hoffmann',
      'Início da vigência · Daniel Jardim Hoffmann',
    ])
  })

  it('should fall to the tail of the CPF when the whole name repeats too', () => {
    expect(closingFields(namesakes('Daniel Guedes Hoffmann')).map(fieldLabel)).toEqual([
      'Carteirinha · Daniel Guedes Hoffmann (CPF 843-80)',
      'Início da vigência · Daniel Guedes Hoffmann (CPF 843-80)',
      'Carteirinha · Daniel Guedes Hoffmann (CPF 240-33)',
      'Início da vigência · Daniel Guedes Hoffmann (CPF 240-33)',
    ])
  })

  it('should ask only the end date on an exclusion, with the end the HR requested', () => {
    expect(closingFields(subject('exclusion'))).toEqual([
      expect.objectContaining({ key: END_KEY, requested: '2024-02-01' }),
    ])
  })

  it('should ask only the new effective date on a plan change, with the date the HR requested', () => {
    expect(closingFields(subject('plan_change'))).toEqual([
      expect.objectContaining({ key: EFFECTIVE_KEY, requested: '2024-03-01' }),
    ])
  })

  it('should ask nothing for a type the rule exempts', () => {
    expect(closingFields(subject('registration_data_change'))).toEqual([])
    expect(closingFields(subject('combined_change'))).toEqual([])
  })

  it('should ask nothing when the ticket is set to complete without the data', () => {
    expect(closingFields(subject('inclusion', { forceCompletion: true }))).toEqual([])
  })
})

describe('completionBlock', () => {
  it('should let an inclusion complete from the carrier and from each pending state', () => {
    for (const status of [
      'carrier-processing',
      'missing-documents',
      'incorrect-data',
      'broker-open-issue',
    ] as const) {
      expect(completionBlock(subject('inclusion'), status)).toBeNull()
    }
  })

  it('should block a completion from a state the API does not complete from', () => {
    expect(completionBlock(subject('inclusion'), 'broker-processing')).toBe('status')
    expect(completionBlock(subject('exclusion'), 'submitted-cancellation')).toBe('status')
  })

  it('should block an inclusion whose lives the snapshot does not identify', () => {
    const unnamed = subject('inclusion', {
      enrollmentSnapshot: family({ dependents: [{ profile: { name: 'Sem CPF' } }] }),
    })
    const empty = subject('inclusion', { enrollmentSnapshot: {} })

    expect(completionBlock(unnamed, 'carrier-processing')).toBe('lives')
    expect(completionBlock(empty, 'carrier-processing')).toBe('lives')
  })

  it('should not look at the lives of an exclusion', () => {
    expect(
      completionBlock(subject('exclusion', { enrollmentSnapshot: {} }), 'carrier-processing'),
    ).toBeNull()
  })

  it('should let an exempt type or a forced ticket complete from any state', () => {
    expect(completionBlock(subject('registration_data_change'), 'broker-processing')).toBeNull()
    expect(
      completionBlock(subject('inclusion', { forceCompletion: true }), 'broker-processing'),
    ).toBeNull()
  })
})

describe('missingClosing', () => {
  const filled = {
    [cardKey(ANA)]: '9912',
    [startKey(ANA)]: '2023-10-22',
    [cardKey(LEO)]: '9913',
    [startKey(LEO)]: '2024-01-01',
  }

  it('should report every empty field at once, not only the first', () => {
    const missing = missingClosing(closingFields(subject('inclusion')), { [cardKey(ANA)]: '  ' })

    expect(missing.map((item) => item.key)).toEqual([
      cardKey(ANA),
      startKey(ANA),
      cardKey(LEO),
      startKey(LEO),
    ])
    expect(missing.every((item) => item.reason === 'empty')).toBe(true)
  })

  it('should refuse a start earlier than a month before the admission', () => {
    const missing = missingClosing(closingFields(subject('inclusion')), {
      ...filled,
      [startKey(ANA)]: '2023-10-21',
    })

    expect(missing).toEqual([
      { key: startKey(ANA), label: 'Início da vigência · Ana', reason: 'early' },
    ])
  })

  it('should take a date the calendar does not have as no value, as the API does', () => {
    const missing = missingClosing(closingFields(subject('inclusion')), {
      ...filled,
      [startKey(LEO)]: '2024-02-31',
    })

    expect(missing).toEqual([
      { key: startKey(LEO), label: 'Início da vigência · Léo', reason: 'empty' },
    ])
  })

  it('should accept the floor itself', () => {
    expect(missingClosing(closingFields(subject('inclusion')), filled)).toEqual([])
  })
})

describe('completionBodyOf', () => {
  it('should answer each life of an inclusion by its tax id, trimmed', () => {
    const fields = closingFields(subject('inclusion'))

    expect(
      completionBodyOf(fields, {
        [cardKey(ANA)]: ' 9912 ',
        [startKey(ANA)]: '2023-12-01',
        [cardKey(LEO)]: '9913',
        [startKey(LEO)]: '2024-01-01',
      }),
    ).toEqual({
      members: [
        { taxId: ANA, idCardNumber: '9912', startDate: '2023-12-01' },
        { taxId: LEO, idCardNumber: '9913', startDate: '2024-01-01' },
      ],
    })
  })

  it('should send only the end date of an exclusion', () => {
    expect(
      completionBodyOf(closingFields(subject('exclusion')), { [END_KEY]: '2024-02-01' }),
    ).toEqual({ endDate: '2024-02-01' })
  })

  it('should send only the new effective date of a plan change', () => {
    expect(
      completionBodyOf(closingFields(subject('plan_change')), { [EFFECTIVE_KEY]: '2024-03-01' }),
    ).toEqual({ effectiveDate: '2024-03-01' })
  })

  it('should send no block when the rule asks for nothing', () => {
    expect(completionBodyOf(closingFields(subject('registration_data_change')), {})).toBeUndefined()
  })
})

describe('rejectedFields', () => {
  it('should pin each refusal of the API on the field it names', () => {
    const fields = closingFields(subject('inclusion'))

    expect(
      rejectedFields(fields, [
        { field: `members[${LEO}].startDate`, code: 'before_admission', message: '' },
        { field: 'status', code: 'invalid_status', message: '' },
      ]),
    ).toEqual({ [startKey(LEO)]: 'before_admission' })
  })
})

describe('describeMissing', () => {
  it('should say nothing when nothing is missing', () => {
    expect(describeMissing([])).toBe('')
  })

  it('should agree the verb with a single empty field', () => {
    expect(describeMissing([{ key: 'k', label: 'Carteirinha', reason: 'empty' }])).toBe(
      'Falta Carteirinha',
    )
  })

  it('should join the empty ones and the early ones in one sentence', () => {
    expect(
      describeMissing([
        { key: 'a', label: 'Carteirinha · Ana', reason: 'empty' },
        { key: 'b', label: 'Carteirinha · Léo', reason: 'empty' },
        { key: 'c', label: 'Início da vigência · Ana', reason: 'early' },
      ]),
    ).toBe(
      'Faltam Carteirinha · Ana, Carteirinha · Léo. Início da vigência · Ana antes de um mês da admissão',
    )
  })
})
