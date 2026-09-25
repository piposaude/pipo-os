import { useId, useState } from 'react'
import { Button } from '@piposaude/design-system'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { components } from '@pipo-os/api-client'
import { client } from '@/lib/api'
import {
  DESTINATION_ORDER,
  EMPTY_DRAFT,
  PARKED_DESTINATIONS,
  partsOf,
  toggleDestination,
  toggleSplit,
  withText,
  type ComposerDraft,
} from '@/lib/pipodesk/composer'
import constants from '@/constants/pages/pipodesk/ticket'
import styles from './Composer.module.css'

type SubmissionBody = components['schemas']['CreateSubmissionBodyInput']

const copy = constants.composer

export interface ComposerProps {
  ticketId: string
}

export function Composer({ ticketId }: ComposerProps) {
  const queryClient = useQueryClient()
  const labelId = useId()
  const [draft, setDraft] = useState<ComposerDraft>(EMPTY_DRAFT)
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID())

  const submission = useMutation({
    mutationFn: async ({ body }: { body: SubmissionBody; sent: ComposerDraft }) => {
      await client.POST('/api/tickets/{id}/submissions', {
        params: { path: { id: ticketId } },
        body,
      })
    },
    onSuccess: (_, { sent }) => {
      setDraft((current) => (current === sent ? EMPTY_DRAFT : current))
      setSubmissionId(crypto.randomUUID())
      for (const queryKey of [
        ['get', '/api/tickets/{id}', ticketId],
        ['get', '/api/tickets/{id}/timeline', ticketId],
        ['get', '/api/tickets/rows'],
        ['get', '/api/tickets/inbox'],
      ]) {
        void queryClient.invalidateQueries({ queryKey })
      }
    },
  })

  const parts = partsOf(draft)
  const split = draft.split !== null
  const hint = draft.destinations.includes('platform') ? copy.hint.platform : copy.hint.internal

  const send = () => submission.mutate({ body: { submissionId, parts }, sent: draft })

  return (
    <div className={styles.composer}>
      <div className={styles.destinations}>
        <span id={labelId} className={styles.destinationsLabel}>
          {copy.destinationsLabel}
        </span>
        <div className={styles.destinationList} role="group" aria-labelledby={labelId}>
          {DESTINATION_ORDER.map((destination) => (
            <button
              key={destination}
              type="button"
              className={styles.destination}
              aria-pressed={draft.destinations.includes(destination)}
              disabled={PARKED_DESTINATIONS.has(destination)}
              onClick={() => setDraft((current) => toggleDestination(current, destination))}
            >
              {copy.destination[destination]}
            </button>
          ))}
          <button
            type="button"
            className={`${styles.destination} ${styles.escape}`}
            aria-pressed={split}
            disabled={!split && draft.destinations.length < 2}
            title={
              split
                ? copy.split.closeHint
                : draft.destinations.length < 2
                  ? copy.split.needsTwo
                  : copy.split.openHint
            }
            onClick={() => setDraft(toggleSplit)}
          >
            {split ? copy.split.close : copy.split.open}
          </button>
        </div>
        <p className={styles.hint}>{hint}</p>
        <p className={styles.hint}>{copy.emailParked}</p>
      </div>

      {draft.split === null ? (
        <textarea
          className={styles.input}
          aria-label={copy.field}
          placeholder={copy.placeholder}
          value={draft.text}
          onChange={(event) => setDraft((current) => withText(current, event.target.value))}
        />
      ) : (
        <div className={styles.splitBoxes}>
          {draft.destinations.map((destination) => (
            <div key={destination} className={styles.splitBox}>
              <span className={styles.splitLabel}>{copy.destination[destination]}</span>
              <textarea
                className={styles.input}
                aria-label={copy.fieldFor(copy.destination[destination])}
                placeholder={copy.placeholderFor(copy.destination[destination])}
                value={draft.split?.[destination] ?? ''}
                onChange={(event) =>
                  setDraft((current) => withText(current, event.target.value, destination))
                }
              />
            </div>
          ))}
        </div>
      )}

      {submission.isError && (
        <p role="alert" className={styles.hint}>
          {copy.sendFailed}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          variant="primary"
          disabled={parts.length === 0 || submission.isPending}
          onClick={send}
        >
          {copy.submit}
        </Button>
      </div>
    </div>
  )
}
