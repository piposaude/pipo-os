import type { Ticket, components } from '@pipo-os/api-client'
import { CLOSING_FIELD_COPY, CLOSING_MISSING_COPY } from '@/constants/pipodesk/closing'
import { isRealDay } from '@/lib/date'
import { completionSnapshotOf, type CompletionLife } from './snapshot'
import type { ApiStatus } from './status'

type CompletionBody = components['schemas']['TicketCompletionBodyInput']
type ErrorDetail = components['schemas']['ErrorDetail']

export type ClosingSubject = Pick<
  Ticket,
  'enrollmentType' | 'forceCompletion' | 'enrollmentSnapshot'
>

export type ClosingValues = Record<string, string>

export const cardKey = (taxId: string): string => `members[${taxId}].idCardNumber`
export const startKey = (taxId: string): string => `members[${taxId}].startDate`
export const END_KEY = 'endDate'
export const EFFECTIVE_KEY = 'effectiveDate'

export interface ClosingField {
  key: string
  label: string
  kind: 'text' | 'date'
  /** The life the field belongs to — only on an inclusion. */
  life?: CompletionLife
  /** How the life is named in a message: the shortest form no other life of
   *  the movement answers to. */
  lifeName?: string
  /** Admission minus one month; a start below it is refused. */
  floor?: string
  requested?: string | null
}

export interface MissingField {
  key: string
  label: string
  reason: 'empty' | 'early'
}

export type CompletionBlock = 'status' | 'lives'

const COMPLETABLE_FROM: ReadonlySet<ApiStatus> = new Set([
  'carrier-processing',
  'missing-documents',
  'broker-open-issue',
  'incorrect-data',
])

const EXEMPT: ReadonlySet<string> = new Set(['registration_data_change', 'combined_change'])

const asksNothing = (subject: ClosingSubject): boolean =>
  subject.forceCompletion || EXEMPT.has(subject.enrollmentType)

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

const firstNameOf = (life: CompletionLife): string => life.name.split(/\s+/)[0]

const cpfTailOf = (taxId: string): string => `${taxId.slice(-5, -2)}-${taxId.slice(-2)}`

function nameOfEachLife(lives: CompletionLife[]): Map<string, string> {
  const alone = (life: CompletionLife, nameOf: (life: CompletionLife) => string): boolean =>
    lives.filter((other) => nameOf(other) === nameOf(life)).length === 1

  return new Map(
    lives.map((life): [string, string] => {
      if (alone(life, firstNameOf)) return [life.taxId, firstNameOf(life)]
      if (alone(life, (other) => other.name)) return [life.taxId, life.name]
      return [life.taxId, CLOSING_MISSING_COPY.cpfTail(life.name, cpfTailOf(life.taxId))]
    }),
  )
}

function identifiedLives(lives: CompletionLife[]): CompletionLife[] {
  const seen = new Set<string>()
  return lives.filter((life) => {
    if (life.taxId === '' || seen.has(life.taxId)) return false
    seen.add(life.taxId)
    return true
  })
}

export function closingFields(subject: ClosingSubject): ClosingField[] {
  if (asksNothing(subject)) return []
  const snapshot = completionSnapshotOf(subject.enrollmentSnapshot)

  switch (subject.enrollmentType) {
    case 'inclusion': {
      const lives = identifiedLives(snapshot.lives)
      const names = nameOfEachLife(lives)
      const floor = snapshot.admissionDate ? oneMonthBefore(snapshot.admissionDate) : undefined
      return lives.flatMap((life): ClosingField[] => [
        {
          key: cardKey(life.taxId),
          label: CLOSING_FIELD_COPY.card,
          kind: 'text',
          life,
          lifeName: names.get(life.taxId),
        },
        {
          key: startKey(life.taxId),
          label: CLOSING_FIELD_COPY.start,
          kind: 'date',
          life,
          lifeName: names.get(life.taxId),
          floor,
          requested: snapshot.requestedStart,
        },
      ])
    }
    case 'exclusion':
      return [
        {
          key: END_KEY,
          label: CLOSING_FIELD_COPY.end,
          kind: 'date',
          requested: snapshot.requestedEnd,
        },
      ]
    case 'plan_change':
      return [
        {
          key: EFFECTIVE_KEY,
          label: CLOSING_FIELD_COPY.effective,
          kind: 'date',
          requested: snapshot.requestedEffective,
        },
      ]
    default:
      return []
  }
}

export function completionBlock(
  subject: ClosingSubject,
  status: ApiStatus,
): CompletionBlock | null {
  if (asksNothing(subject)) return null
  if (!COMPLETABLE_FROM.has(status)) return 'status'
  if (subject.enrollmentType === 'inclusion') {
    const { lives } = completionSnapshotOf(subject.enrollmentSnapshot)
    if (lives.length === 0 || lives.some((life) => life.taxId === '')) return 'lives'
  }
  return null
}

export function fieldLabel(field: ClosingField): string {
  if (field.lifeName === undefined) return field.label
  return `${field.label} · ${field.lifeName}`
}

export function missingClosing(fields: ClosingField[], values: ClosingValues): MissingField[] {
  return fields.flatMap((field): MissingField[] => {
    const value = (values[field.key] ?? '').trim()
    const noValue = value === '' || (field.kind === 'date' && !isRealDay(value))
    if (noValue) return [{ key: field.key, label: fieldLabel(field), reason: 'empty' }]
    if (field.floor !== undefined && value < field.floor) {
      return [{ key: field.key, label: fieldLabel(field), reason: 'early' }]
    }
    return []
  })
}

export function completionBodyOf(
  fields: ClosingField[],
  values: ClosingValues,
): CompletionBody | undefined {
  if (fields.length === 0) return undefined
  const valueOf = (key: string): string => (values[key] ?? '').trim()

  const lives = identifiedLives(fields.flatMap((field) => (field.life ? [field.life] : [])))
  const body: CompletionBody = {}
  if (lives.length > 0) {
    body.members = lives.map((life) => ({
      taxId: life.taxId,
      idCardNumber: valueOf(cardKey(life.taxId)),
      startDate: valueOf(startKey(life.taxId)),
    }))
  }
  if (fields.some((field) => field.key === END_KEY)) body.endDate = valueOf(END_KEY)
  if (fields.some((field) => field.key === EFFECTIVE_KEY)) {
    body.effectiveDate = valueOf(EFFECTIVE_KEY)
  }
  return body
}

export function rejectedFields(
  fields: ClosingField[],
  details: ErrorDetail[],
): Record<string, string> {
  const keys = new Set(fields.map((field) => field.key))
  return Object.fromEntries(
    details.filter((detail) => keys.has(detail.field)).map((detail) => [detail.field, detail.code]),
  )
}

export function describeMissing(missing: MissingField[]): string {
  const empty = missing.filter((item) => item.reason === 'empty').map((item) => item.label)
  const early = missing.filter((item) => item.reason === 'early').map((item) => item.label)
  const parts: string[] = []
  if (empty.length > 0) parts.push(CLOSING_MISSING_COPY.empty(empty))
  if (early.length > 0) parts.push(CLOSING_MISSING_COPY.early(early))
  return parts.join('. ')
}
