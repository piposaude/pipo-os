import { displayNameOf, type Person, type TicketRecords } from './record'
import type { TicketRow } from './ticket-row'

/**
 * What closing a movement asks for. The keys are `ticket_form_values`, unique
 * on `(ticket_id, field_key)` — hence one key per life, id inside the key.
 */

export type ClosingValues = Record<string, string>

export const cardKey = (beneficiaryId: string): string => `card_id:${beneficiaryId}`
export const startKey = (beneficiaryId: string): string => `start_date:${beneficiaryId}`
export const END_KEY = 'end_date'
export const EFFECTIVE_KEY = 'effective_date'

export interface ClosingField {
  key: string
  label: string
  kind: 'text' | 'date'
  /** The life the field belongs to — only on an inclusion. */
  person?: Person
  /** How the life is named in a message: the shortest form no other life of
   *  the movement answers to. */
  personName?: string
  /** Admission minus one month; a start below it is refused. */
  floor?: string
}

export interface MissingField {
  key: string
  label: string
  reason: 'empty' | 'early'
}

const LABEL = {
  card: 'Carteirinha',
  start: 'Início da vigência',
  end: 'Data de fim da vigência',
  effective: 'Nova data de vigência',
}

/**
 * The engine's floor, overshoot and all: Go's `AddDate(0, -1, 0)` normalizes
 * 31 February into 2 March, so a 31 March admission floors at 2 March — later
 * than the date it sits below. Clamping it here would accept a start the API
 * refuses, which is the one thing this pre-check exists to prevent.
 */
export function oneMonthBefore(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() - 1)
  return date.toISOString().slice(0, 10)
}

export function livesOf(ticket: TicketRow, records: TicketRecords): Person[] {
  if (ticket.enrollmentType !== 'inclusion') return []
  const movement = records.movementOf(ticket.id)
  if (!movement) return []
  return [movement.beneficiaryId, ...movement.dependentIds]
    .map((id) => records.personById.get(id))
    .filter((person): person is Person => person !== undefined)
}

const firstNameOf = (person: Person): string => displayNameOf(person).split(/\s+/)[0]

const cpfTailOf = (cpf: string): string => {
  const digits = cpf.replace(/\D/g, '')
  return `${digits.slice(-5, -2)}-${digits.slice(-2)}`
}

function nameOfEachLife(lives: Person[]): Map<string, string> {
  const alone = (life: Person, nameOf: (life: Person) => string): boolean =>
    lives.filter((other) => nameOf(other) === nameOf(life)).length === 1

  return new Map(
    lives.map((life): [string, string] => {
      if (alone(life, firstNameOf)) return [life.id, firstNameOf(life)]
      if (alone(life, displayNameOf)) return [life.id, displayNameOf(life)]
      return [life.id, `${displayNameOf(life)} (CPF ${cpfTailOf(life.cpf)})`]
    }),
  )
}

export function closingFields(ticket: TicketRow, records: TicketRecords): ClosingField[] {
  switch (ticket.enrollmentType) {
    case 'inclusion': {
      const lives = livesOf(ticket, records)
      const names = nameOfEachLife(lives)
      return lives.flatMap((person) => [
        {
          key: cardKey(person.id),
          label: LABEL.card,
          kind: 'text' as const,
          person,
          personName: names.get(person.id),
        },
        {
          key: startKey(person.id),
          label: LABEL.start,
          kind: 'date' as const,
          person,
          personName: names.get(person.id),
          floor: oneMonthBefore(person.link.admissionDate),
        },
      ])
    }
    case 'exclusion':
      return [{ key: END_KEY, label: LABEL.end, kind: 'date' }]
    case 'plan_change':
      return [{ key: EFFECTIVE_KEY, label: LABEL.effective, kind: 'date' }]
    /* `registration_data_change` and `combined_change` have no rule in the
       engine; an invented field here would block a closing the API takes. */
    default:
      return []
  }
}

export function fieldLabel(field: ClosingField): string {
  if (field.personName === undefined) return field.label
  return `${field.label} · ${field.personName}`
}

export function missingClosing(fields: ClosingField[], values: ClosingValues): MissingField[] {
  return fields.flatMap((field): MissingField[] => {
    const value = (values[field.key] ?? '').trim()
    if (value === '') return [{ key: field.key, label: fieldLabel(field), reason: 'empty' }]
    if (field.floor !== undefined && value < field.floor) {
      return [{ key: field.key, label: fieldLabel(field), reason: 'early' }]
    }
    return []
  })
}

export function describeMissing(missing: MissingField[]): string {
  const empty = missing.filter((item) => item.reason === 'empty').map((item) => item.label)
  const early = missing.filter((item) => item.reason === 'early').map((item) => item.label)
  const parts: string[] = []
  if (empty.length > 0) {
    parts.push(`${empty.length === 1 ? 'Falta' : 'Faltam'} ${empty.join(', ')}`)
  }
  if (early.length > 0) parts.push(`${early.join(', ')} antes de um mês da admissão`)
  return parts.join('. ')
}
