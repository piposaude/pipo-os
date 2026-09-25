import type { components } from '@pipo-os/api-client'
import { API_STATUSES, DISPLAY_STATUSES, toDisplayStatus, type ApiStatus } from './status'

type SubmissionBody = components['schemas']['CreateSubmissionBodyInput']
type SubmissionPart = SubmissionBody['parts'][number]
type CompletionBody = components['schemas']['TicketCompletionBodyInput']

export type Destination = 'internal' | 'platform' | 'email'

export const DESTINATION_ORDER: readonly Destination[] = ['internal', 'platform', 'email']

export const PARKED_DESTINATIONS: ReadonlySet<Destination> = new Set(['email'])

type Texts = Partial<Record<Destination, string>>

export interface ComposerDraft {
  destinations: Destination[]
  text: string
  split: Texts | null
  stashed: { texts: Texts; single: Destination } | null
  status: ApiStatus | null
  completion: Record<string, string>
}

export const EMPTY_DRAFT: ComposerDraft = {
  destinations: ['internal'],
  text: '',
  split: null,
  stashed: null,
  status: null,
  completion: {},
}

export const SEND_STATUSES: readonly ApiStatus[] = [...API_STATUSES].sort(
  (a, b) =>
    DISPLAY_STATUSES.indexOf(toDisplayStatus(a).status) -
    DISPLAY_STATUSES.indexOf(toDisplayStatus(b).status),
)

export function toggleDestination(draft: ComposerDraft, destination: Destination): ComposerDraft {
  if (PARKED_DESTINATIONS.has(destination)) return draft
  const { destinations } = draft
  if (!destinations.includes(destination)) {
    return {
      ...draft,
      destinations: DESTINATION_ORDER.filter(
        (value) => value === destination || destinations.includes(value),
      ),
    }
  }
  if (destinations.length === 1) return draft
  return { ...draft, destinations: destinations.filter((value) => value !== destination) }
}

export function withText(
  draft: ComposerDraft,
  text: string,
  destination?: Destination,
): ComposerDraft {
  if (draft.split === null || destination === undefined) return { ...draft, text }
  return { ...draft, split: { ...draft.split, [destination]: text } }
}

export function toggleSplit(draft: ComposerDraft): ComposerDraft {
  const { split, stashed, destinations, text } = draft
  if (split !== null) {
    const single = destinations[0]
    return { ...draft, split: null, text: split[single] ?? text, stashed: { texts: split, single } }
  }
  return {
    ...draft,
    split: Object.fromEntries(
      destinations.map((value) => [
        value,
        stashed === null || value === stashed.single ? text : (stashed.texts[value] ?? text),
      ]),
    ),
  }
}

export const textFor = (draft: ComposerDraft, destination: Destination): string =>
  (draft.split === null ? draft.text : (draft.split[destination] ?? '')).trim()

export function partsOf(draft: ComposerDraft): SubmissionPart[] {
  return draft.destinations.flatMap((destination): SubmissionPart[] => {
    if (destination === 'email') return []
    const body = textFor(draft, destination)
    return body === '' ? [] : [{ channel: destination, body }]
  })
}

export const withStatus = (draft: ComposerDraft, status: ApiStatus): ComposerDraft => ({
  ...draft,
  status,
})

export const withCompletionValue = (
  draft: ComposerDraft,
  key: string,
  value: string,
): ComposerDraft => ({ ...draft, completion: { ...draft.completion, [key]: value } })

export const statusChangeOf = (draft: ComposerDraft, current: ApiStatus): ApiStatus | null =>
  draft.status !== null && draft.status !== current ? draft.status : null

export function sameSubmission(a: ComposerDraft, b: ComposerDraft, current: ApiStatus): boolean {
  if (statusChangeOf(a, current) !== statusChangeOf(b, current)) return false
  const keys = new Set([...Object.keys(a.completion), ...Object.keys(b.completion)])
  for (const key of keys) {
    if ((a.completion[key] ?? '').trim() !== (b.completion[key] ?? '').trim()) return false
  }
  return JSON.stringify(partsOf(a)) === JSON.stringify(partsOf(b))
}

export function submissionBodyOf(
  draft: ComposerDraft,
  current: ApiStatus,
  submissionId: string,
  completion?: CompletionBody,
): SubmissionBody {
  const body: SubmissionBody = { submissionId, parts: partsOf(draft) }
  const status = statusChangeOf(draft, current)
  if (status === null) return body
  body.status = status === 'completed' && completion ? { status, completion } : { status }
  return body
}
