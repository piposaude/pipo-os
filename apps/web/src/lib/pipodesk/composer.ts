import type { components } from '@pipo-os/api-client'

type SubmissionPart = components['schemas']['CreateSubmissionBodyInput']['parts'][number]

export type Destination = 'internal' | 'platform' | 'email'

export const DESTINATION_ORDER: readonly Destination[] = ['internal', 'platform', 'email']

export const PARKED_DESTINATIONS: ReadonlySet<Destination> = new Set(['email'])

type Texts = Partial<Record<Destination, string>>

export interface ComposerDraft {
  destinations: Destination[]
  text: string
  split: Texts | null
  stashed: { texts: Texts; single: Destination } | null
}

export const EMPTY_DRAFT: ComposerDraft = {
  destinations: ['internal'],
  text: '',
  split: null,
  stashed: null,
}

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
