import {
  EFFECTIVE_KEY,
  END_KEY,
  cardKey,
  closingFields,
  describeMissing,
  fieldLabel,
  livesOf,
  missingClosing,
  oneMonthBefore,
  startKey,
} from '@/lib/pipodesk/closing'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import { link, person, recordsWith } from '../../../helpers/records'

const ticket = (enrollmentType: string): TicketRow =>
  ({ id: 'T-1', enrollmentType }) as unknown as TicketRow

const family = (dependentCpf?: string) =>
  recordsWith({
    beneficiaries: [
      person('holder', {
        name: 'Ana Souza',
        link: link({ admissionDate: '2023-11-22' }),
      }),
      person('dep', {
        role: 'dependent',
        holderId: 'holder',
        ...(dependentCpf === undefined ? {} : { cpf: dependentCpf }),
      }),
      person('out', { role: 'dependent', holderId: 'holder' }),
    ],
    // `Movement.id` is the ticket id: the record indexes movements by it.
    tickets: [
      {
        id: 'T-1',
        beneficiaryId: 'holder',
        dependentIds: ['dep'],
        policyId: 'policy-1',
        pendingDocumentation: null,
      },
    ],
  })

const namesakes = (depName = 'Daniel Jardim Hoffmann') =>
  recordsWith({
    beneficiaries: [
      person('holder', { name: 'Daniel Guedes Hoffmann', cpf: '951.244.843-80' }),
      person('dep', {
        name: depName,
        cpf: '217.267.240-33',
        role: 'dependent',
        holderId: 'holder',
      }),
    ],
    tickets: [
      {
        id: 'T-1',
        beneficiaryId: 'holder',
        dependentIds: ['dep'],
        policyId: 'policy-1',
        pendingDocumentation: null,
      },
    ],
  })

describe('oneMonthBefore', () => {
  it('should walk back one calendar month', () => {
    expect(oneMonthBefore('2023-11-22')).toBe('2023-10-22')
  })

  /** The engine floors a 31 March admission at 2 March, and a front that
   *  clamped to 29 February would greenlight a start the API refuses. */
  it('should overshoot a short month exactly as the engine does', () => {
    expect(oneMonthBefore('2024-03-31')).toBe('2024-03-02')
    expect(oneMonthBefore('2023-10-31')).toBe('2023-10-01')
  })
})

describe('livesOf', () => {
  it('should take the holder first and only the dependents of this movement', () => {
    expect(livesOf(ticket('inclusion'), family()).map((life) => life.id)).toEqual(['holder', 'dep'])
  })

  it('should leave out a life without CPF, as the API does', () => {
    expect(livesOf(ticket('inclusion'), family('')).map((life) => life.id)).toEqual(['holder'])
  })

  it('should take no life when the movement is not an inclusion', () => {
    expect(livesOf(ticket('exclusion'), family())).toEqual([])
  })
})

describe('closingFields', () => {
  it('should ask a card and a start per life on an inclusion', () => {
    const fields = closingFields(ticket('inclusion'), family())

    expect(fields.map((field) => field.key)).toEqual([
      cardKey('holder'),
      startKey('holder'),
      cardKey('dep'),
      startKey('dep'),
    ])
    expect(fields[1].floor).toBe('2023-10-22')
    expect(fields[0].floor).toBeUndefined()
  })

  it('should name a life in full when another life of the movement answers to the same first name', () => {
    expect(closingFields(ticket('inclusion'), namesakes()).map(fieldLabel)).toEqual([
      'Carteirinha · Daniel Guedes Hoffmann',
      'Início da vigência · Daniel Guedes Hoffmann',
      'Carteirinha · Daniel Jardim Hoffmann',
      'Início da vigência · Daniel Jardim Hoffmann',
    ])
  })

  it('should fall to the tail of the CPF when the whole name repeats too', () => {
    expect(
      closingFields(ticket('inclusion'), namesakes('Daniel Guedes Hoffmann')).map(fieldLabel),
    ).toEqual([
      'Carteirinha · Daniel Guedes Hoffmann (CPF 843-80)',
      'Início da vigência · Daniel Guedes Hoffmann (CPF 843-80)',
      'Carteirinha · Daniel Guedes Hoffmann (CPF 240-33)',
      'Início da vigência · Daniel Guedes Hoffmann (CPF 240-33)',
    ])
  })

  it('should ask only the end date on an exclusion', () => {
    expect(closingFields(ticket('exclusion'), family()).map((field) => field.key)).toEqual([
      END_KEY,
    ])
  })

  it('should ask only the new effective date on a plan change', () => {
    expect(closingFields(ticket('plan_change'), family()).map((field) => field.key)).toEqual([
      EFFECTIVE_KEY,
    ])
  })

  it('should ask nothing for a type the rule does not cover', () => {
    expect(closingFields(ticket('registration_data_change'), family())).toEqual([])
    expect(closingFields(ticket('combined_change'), family())).toEqual([])
  })
})

describe('missingClosing', () => {
  it('should report every empty field at once, not only the first', () => {
    const fields = closingFields(ticket('inclusion'), family())
    const missing = missingClosing(fields, { [cardKey('holder')]: '  ' })

    expect(missing.map((item) => item.key)).toEqual([
      cardKey('holder'),
      startKey('holder'),
      cardKey('dep'),
      startKey('dep'),
    ])
    expect(missing.every((item) => item.reason === 'empty')).toBe(true)
  })

  it('should refuse a start earlier than a month before the admission', () => {
    const fields = closingFields(ticket('inclusion'), family())
    const missing = missingClosing(fields, {
      [cardKey('holder')]: '9912',
      [startKey('holder')]: '2023-10-21',
      [cardKey('dep')]: '9913',
      [startKey('dep')]: '2024-01-01',
    })

    expect(missing).toEqual([
      { key: startKey('holder'), label: 'Início da vigência · Ana', reason: 'early' },
    ])
  })

  it('should take a date that is not a zero-padded ISO day as no value, instead of comparing it with the floor as a string', () => {
    const fields = closingFields(ticket('inclusion'), family())
    const missing = missingClosing(fields, {
      [cardKey('holder')]: '9912',
      // Lexicographically above the floor `2023-10-22` — `'9' > '1'` — and
      // months earlier than it.
      [startKey('holder')]: '2023-9-5',
      [cardKey('dep')]: '9913',
      [startKey('dep')]: '2024-01-01',
    })

    expect(missing).toEqual([
      { key: startKey('holder'), label: 'Início da vigência · Ana', reason: 'empty' },
    ])
  })

  it('should accept the floor itself', () => {
    const fields = closingFields(ticket('inclusion'), family())
    const missing = missingClosing(fields, {
      [cardKey('holder')]: '9912',
      [startKey('holder')]: '2023-10-22',
      [cardKey('dep')]: '9913',
      [startKey('dep')]: '2024-01-01',
    })

    expect(missing).toEqual([])
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
