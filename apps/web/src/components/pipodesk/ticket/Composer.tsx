import { useId, useMemo, useRef, useState } from 'react'
import { Icon } from '@piposaude/design-system'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Ticket, components } from '@pipo-os/api-client'
import { DeskIcon } from '@/components/pipodesk/icons'
import { Popover } from '@/components/pipodesk/primitives'
import { ApiError, client } from '@/lib/api'
import {
  closingFields,
  completionBlock,
  completionBodyOf,
  describeMissing,
  fieldLabel,
  missingClosing,
  rejectedFields,
} from '@/lib/pipodesk/closing'
import {
  DESTINATION_ORDER,
  EMPTY_DRAFT,
  PARKED_DESTINATIONS,
  SEND_STATUSES,
  partsOf,
  sameSubmission,
  statusChangeOf,
  submissionBodyOf,
  toggleDestination,
  toggleSplit,
  withCompletionValue,
  withStatus,
  withText,
  type ComposerDraft,
} from '@/lib/pipodesk/composer'
import { completionSnapshotOf } from '@/lib/pipodesk/snapshot'
import { isOpen, type ApiStatus } from '@/lib/pipodesk/status'
import { statusCopyOf } from '@/constants/pipodesk/status'
import constants from '@/constants/pages/pipodesk/ticket'
import { ConclusionDrawer } from './ConclusionDrawer'
import styles from './Composer.module.css'

type SubmissionBody = components['schemas']['CreateSubmissionBodyInput']

const copy = constants.composer
const conclusionCopy = constants.conclusion

export interface ComposerProps {
  ticket: Ticket
  /** The status the screen shows, which may carry a patch the API has not echoed yet. */
  status: ApiStatus
}

export function Composer({ ticket, status }: ComposerProps) {
  const queryClient = useQueryClient()
  const labelId = useId()
  const blockedId = useId()
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [rejected, setRejected] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<ComposerDraft>(EMPTY_DRAFT)
  const [attempt, setAttempt] = useState<{
    id: string
    draft: ComposerDraft
    status: ApiStatus
  } | null>(null)

  const fields = useMemo(() => closingFields(ticket), [ticket])
  const { admissionDate } = useMemo(
    () => completionSnapshotOf(ticket.enrollmentSnapshot),
    [ticket.enrollmentSnapshot],
  )

  const submission = useMutation({
    mutationFn: async ({ body }: { body: SubmissionBody; sent: ComposerDraft }) => {
      await client.POST('/api/tickets/{id}/submissions', {
        params: { path: { id: ticket.id } },
        body,
      })
    },
    onSuccess: (_, { sent }) => {
      setDraft((current) => (current === sent ? EMPTY_DRAFT : current))
      setAttempt(null)
      for (const queryKey of [
        ['get', '/api/tickets/{id}', ticket.id],
        ['get', '/api/tickets/{id}/timeline', ticket.id],
        ['get', '/api/tickets/rows'],
        ['get', '/api/tickets/inbox'],
      ]) {
        void queryClient.invalidateQueries({ queryKey })
      }
    },
    onError: (error) => {
      if (!(error instanceof ApiError) || error.status !== 422) return
      const refused = rejectedFields(fields, error.details)
      setRejected(refused)
      if (Object.keys(refused).length > 0) setDrawerOpen(true)
    },
  })

  const blocked = useMemo(() => completionBlock(ticket, status), [ticket, status])
  const change = statusChangeOf(draft, status)
  const sendStatus = draft.status ?? status
  const completing = change === 'completed' && fields.length > 0
  const missing = completing ? missingClosing(fields, draft.completion) : []
  const emptyCount = missing.filter((item) => item.reason === 'empty').length
  const parts = partsOf(draft)
  const refused = completing
    ? fields.filter((field) => rejected[field.key] !== undefined).map(fieldLabel)
    : []
  const canSend =
    (parts.length > 0 || change !== null) &&
    missing.length === 0 &&
    refused.length === 0 &&
    !submission.isPending

  const split = draft.split !== null
  const hint = draft.destinations.includes('platform') ? copy.hint.platform : copy.hint.internal

  const send = () => {
    const completion = completing ? completionBodyOf(fields, draft.completion) : undefined
    const id =
      attempt && sameSubmission(attempt.draft, draft, attempt.status)
        ? attempt.id
        : crypto.randomUUID()
    setAttempt({ id, draft, status: attempt?.id === id ? attempt.status : status })
    setRejected({})
    submission.mutate({ body: submissionBodyOf(draft, status, id, completion), sent: draft })
  }

  const pick = (next: ApiStatus) => {
    setDraft((current) => withStatus(current, next))
    setMenuOpen(false)
    if (next === 'completed' && next !== status && fields.length > 0) setDrawerOpen(true)
  }

  const changeValue = (key: string, value: string) => {
    setDraft((current) => withCompletionValue(current, key, value))
    setRejected((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

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

      {completing && (
        <div className={styles.summary}>
          <p className={styles.summaryTitle}>
            {conclusionCopy.summary}
            <small>{conclusionCopy.filled(fields.length - emptyCount, fields.length)}</small>
            <button
              type="button"
              className={`${styles.destination} ${styles.summaryOpen}`}
              onClick={() => setDrawerOpen(true)}
            >
              {missing.length > 0 || refused.length > 0
                ? conclusionCopy.fill
                : conclusionCopy.review}
            </button>
          </p>
          {missing.length > 0 && <p className={styles.missing}>{`${describeMissing(missing)}.`}</p>}
          {refused.length > 0 && (
            <p className={styles.missing}>{conclusionCopy.refused(refused)}</p>
          )}
        </div>
      )}
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
        {!isOpen(status) && <p className={styles.hint}>{copy.closed(statusCopyOf(status))}</p>}
        <span className={styles.menuAnchor}>
          <span className={styles.send} data-disabled={!canSend || undefined}>
            <button type="button" className={styles.sendGo} disabled={!canSend} onClick={send}>
              {copy.submitAs(statusCopyOf(sendStatus))}
            </button>
            {isOpen(status) && (
              <button
                type="button"
                ref={menuTrigger}
                className={styles.sendMore}
                aria-label={copy.changeStatus(statusCopyOf(sendStatus))}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((current) => !current)}
              >
                <Icon name="chevron-down" size="xs" />
              </button>
            )}
          </span>
          <Popover
            open={menuOpen && isOpen(status)}
            onClose={() => setMenuOpen(false)}
            anchor={menuTrigger}
            label={copy.statusMenu}
            align="right"
            side="top"
          >
            {SEND_STATUSES.map((option) => {
              const unavailable = option === 'completed' && blocked !== null
              return (
                <div key={option}>
                  <button
                    type="button"
                    className={styles.menuItem}
                    aria-pressed={option === sendStatus}
                    aria-describedby={unavailable ? blockedId : undefined}
                    disabled={unavailable}
                    onClick={() => pick(option)}
                  >
                    <DeskIcon name="check" size={14} className={styles.menuCheck} />
                    {copy.submitAs(statusCopyOf(option))}
                  </button>
                  {unavailable && (
                    <p id={blockedId} className={styles.menuReason}>
                      {copy.completionBlocked[blocked]}
                    </p>
                  )}
                </div>
              )
            })}
          </Popover>
        </span>
      </div>
      <ConclusionDrawer
        open={drawerOpen && completing}
        onClose={() => setDrawerOpen(false)}
        fields={fields}
        values={draft.completion}
        onChange={changeValue}
        missing={missing}
        rejected={rejected}
        refused={refused}
        admissionDate={admissionDate}
      />
    </div>
  )
}
