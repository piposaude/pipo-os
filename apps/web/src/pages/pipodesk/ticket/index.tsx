import { useEffect, useMemo, useRef, useState } from 'react'
import { Banner, Breadcrumb, BreadcrumbItem, Button, Heading, Tabs } from '@piposaude/design-system'
import { Link, useParams } from '@tanstack/react-router'
import { useDesk } from '@/components/pipodesk/shell/desk-context'
import { Popover } from '@/components/pipodesk/primitives'
import { DISPLAY_STATUS_COPY, PENDING_REASON_COPY } from '@/constants/pipodesk/status'
import {
  COMPANY_SIZE_COPY,
  ENROLLMENT_TYPE_COPY,
  PRIORITY_COPY,
  PRODUCT_COPY,
  RELATIONSHIP_COPY,
} from '@/constants/pipodesk/domain'
import { ORIGIN_COPY } from '@/lib/pipodesk/filter-copy'
import { analystsOf } from '@/lib/pipodesk/permissions'
import { structureFixture } from '@/fixtures/pipodesk/dataset'
import { daysOverdue, formatDate, formatDayMonth } from '@/lib/pipodesk/format'
import {
  CHANNELS,
  CHANNEL_LABEL,
  CHANNEL_ORDER,
  timelineOf,
  type CommentChannel,
} from '@/lib/pipodesk/timeline'
import { PRIORITIES } from '@/lib/pipodesk/ticket-row'
import constants from '@/constants/pages/pipodesk/ticket'
import styles from './style.module.css'

/** One fact: label above, value below. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  )
}

/**
 * Ticket detail — the S3/PD-103 core. Person in the H1, copyable id below
 * (the analyst looks for the person; the number gets pasted elsewhere).
 * Priority and owner edit through the same patches as the queue. Missing:
 * the four record tabs (PD-111), completion form/gates, suggestions and
 * attachments (PD-112).
 */
export default function TicketPage() {
  const { id } = useParams({ from: '/_auth/_desk/tickets/$id' })
  const { view, rows, today, resolveName, applyPatch, comments, addComment } = useDesk()

  const ticket = useMemo(() => rows.find((row) => row.id === id), [rows, id])

  const [copied, setCopied] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [ownerOpen, setOwnerOpen] = useState(false)
  const priorityTrigger = useRef<HTMLButtonElement>(null)
  const ownerTrigger = useRef<HTMLButtonElement>(null)
  const [channel, setChannel] = useState<CommentChannel>('internal')
  const [draft, setDraft] = useState('')

  const events = useMemo(
    () => (ticket ? timelineOf(ticket, comments, resolveName) : []),
    [ticket, comments, resolveName],
  )

  /** Analysts of the ticket's pod, from the structure — the same source the
   *  queue's batch reassign uses. Deriving it from who currently HOLDS a
   *  ticket would hide the analyst with an empty queue, who is exactly the
   *  person you want to hand work to. Above the early return because it is a
   *  hook: an absent ticket has no pod, and `''` matches no group. */
  const podAnalysts = useMemo(
    () => analystsOf(structureFixture, ticket?.groupId ?? '').map(({ userId }) => userId),
    [ticket?.groupId],
  )

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
    },
    [],
  )

  if (!ticket) {
    return (
      <div className={`${styles.screen} ${styles.missing}`}>
        <p>{constants.notFound(id)}</p>
      </div>
    )
  }

  const personName = ticket.beneficiaryName ?? ticket.subject
  /* `null` for no action date AND for one that cannot be read — an unreadable
     date is not an overdue deadline. */
  const overdue = ticket.actionDate === null ? null : daysOverdue(ticket.actionDate, today)
  const activeChannel = CHANNELS[channel]

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(ticket.id)
      setCopied(true)
      /* Cleared before rearming and on unmount: copying and leaving inside the
         window used to set state on a gone component. */
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // No clipboard (permission, iframe): the id stays selectable on screen.
    }
  }

  const situacao = ticket.reason
    ? `${DISPLAY_STATUS_COPY[ticket.display]} · ${PENDING_REASON_COPY[ticket.reason]}`
    : DISPLAY_STATUS_COPY[ticket.display]

  const movimentacao = (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>{constants.facts.heading}</h2>
      <dl className={styles.facts}>
        <Fact label={constants.facts.company} value={ticket.companyName ?? '—'} />
        <Fact label={constants.facts.carrier} value={ticket.carrierName ?? '—'} />
        <Fact
          label={constants.facts.product}
          value={ticket.product ? (PRODUCT_COPY[ticket.product] ?? ticket.product) : '—'}
        />
        <Fact
          label={constants.facts.type}
          value={ENROLLMENT_TYPE_COPY[ticket.enrollmentType] ?? ticket.enrollmentType}
        />
        <Fact
          label={constants.facts.contract}
          value={ticket.contractType ? ticket.contractType.toUpperCase() : '—'}
        />
        <Fact
          label={constants.facts.relationship}
          value={ticket.relationship ? RELATIONSHIP_COPY[ticket.relationship] : '—'}
        />
        <Fact
          label={constants.facts.companySize}
          value={
            ticket.companySize ? (COMPANY_SIZE_COPY[ticket.companySize] ?? ticket.companySize) : '—'
          }
        />
        <Fact label={constants.facts.actionDate} value={formatDate(ticket.actionDate)} />
        <Fact label={constants.facts.createdAt} value={formatDayMonth(ticket.createdAt, today)} />
        <Fact
          label={constants.facts.origin}
          value={ORIGIN_COPY[ticket.sourceSystem] ?? ticket.sourceSystem}
        />
      </dl>
    </section>
  )

  const timeline = (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>{constants.timeline.heading}</h2>
      <ol className={styles.timeline}>
        {events.map((event) => (
          <li key={event.id} className={styles.timelineItem}>
            <div className={styles.timelineMeta}>
              <strong>{event.actor}</strong>
              <time dateTime={event.at}>{formatDayMonth(event.at, today)}</time>
              {event.channel && (
                <span className={styles.timelineChannel}>{CHANNEL_LABEL[event.channel]}</span>
              )}
            </div>
            <p className={styles.timelineBody}>{event.body}</p>
          </li>
        ))}
      </ol>

      <div className={styles.composer}>
        <div
          className={styles.composerChannels}
          role="group"
          aria-label={constants.timeline.channelGroup}
        >
          {CHANNEL_ORDER.map((value) => (
            <button
              key={value}
              type="button"
              className={styles.composerChannel}
              /* aria-pressed, not role="tab": there is no tabpanel to switch, and
                               promising one to screen readers would be a lie. */
              aria-pressed={channel === value}
              disabled={CHANNELS[value].parked === true}
              onClick={() => setChannel(value)}
            >
              {CHANNELS[value].label}
            </button>
          ))}
        </div>
        {/* On screen, not in a `title`: a disabled button takes no focus and its
                     tooltip is not reliably announced, so the reason was mouse-only. */}
        <p className={styles.composerHint}>{constants.timeline.emailPending}</p>
        <p className={styles.composerHint}>{activeChannel.hint}</p>
        <textarea
          className={styles.composerInput}
          /* `aria-label` and not the hidden `<label>` Carteiras uses: that one
             exists because the DS `TextInput` drops `aria-label`; a native
             `textarea` keeps it. */
          aria-label={constants.timeline.label[channel]}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={constants.timeline.placeholder[channel]}
          rows={4}
        />
        <div className={styles.composerActions}>
          <Button
            variant="primary"
            disabled={draft.trim().length === 0}
            onClick={() => {
              addComment(ticket.id, channel, draft.trim())
              setDraft('')
            }}
          >
            {constants.timeline.submit[channel]}
          </Button>
        </div>
      </div>
    </section>
  )

  const contexto = (
    <aside className={styles.context} aria-label={constants.context.region}>
      <section className={styles.contextGroup}>
        <h2 className={styles.contextTitle}>{constants.context.properties}</h2>

        <div className={styles.pill}>
          <span className={styles.pillLabel}>{constants.context.situation}</span>
          <span className={styles.pillValue}>{situacao}</span>
        </div>

        <div className={styles.pill}>
          <span className={styles.pillLabel}>{constants.context.priority}</span>
          <span className={styles.panelAnchor}>
            <button
              type="button"
              ref={priorityTrigger}
              className={styles.pillAction}
              aria-label={constants.context.changeLabel(
                constants.context.priority,
                ticket.priority ? PRIORITY_COPY[ticket.priority] : constants.context.noPriority,
              )}
              aria-expanded={priorityOpen}
              onClick={() => setPriorityOpen((current) => !current)}
            >
              {ticket.priority ? PRIORITY_COPY[ticket.priority] : constants.context.noPriority}
            </button>
            <Popover
              open={priorityOpen}
              onClose={() => setPriorityOpen(false)}
              anchor={priorityTrigger}
              label={constants.context.priority}
            >
              {/* "Sem prioridade" first: the origin value of every ticket, hence the
                                 likeliest pick for someone who opened by mistake. */}
              <button
                type="button"
                className={styles.menuItem}
                disabled={ticket.priority === null}
                onClick={() => {
                  applyPatch([ticket.id], { priority: null })
                  setPriorityOpen(false)
                }}
              >
                {constants.context.noPriority}
              </button>
              {PRIORITIES.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={styles.menuItem}
                  disabled={ticket.priority === level}
                  onClick={() => {
                    applyPatch([ticket.id], { priority: level })
                    setPriorityOpen(false)
                  }}
                >
                  {PRIORITY_COPY[level]}
                </button>
              ))}
            </Popover>
          </span>
        </div>

        <div className={styles.pill}>
          <span className={styles.pillLabel}>{constants.context.owner}</span>
          <span className={styles.panelAnchor}>
            <button
              type="button"
              ref={ownerTrigger}
              className={styles.pillAction}
              aria-label={constants.context.changeLabel(
                constants.context.owner,
                ticket.assigneeId ? resolveName(ticket.assigneeId) : constants.context.free,
              )}
              aria-expanded={ownerOpen}
              onClick={() => setOwnerOpen((current) => !current)}
            >
              {ticket.assigneeId ? resolveName(ticket.assigneeId) : constants.context.free}
            </button>
            <Popover
              open={ownerOpen}
              onClose={() => setOwnerOpen(false)}
              anchor={ownerTrigger}
              label={constants.context.owner}
            >
              {podAnalysts.length === 0 && (
                <p className={styles.menuEmpty}>{constants.context.noAnalysts}</p>
              )}
              {podAnalysts.map((userId) => (
                <button
                  key={userId}
                  type="button"
                  className={styles.menuItem}
                  disabled={userId === ticket.assigneeId}
                  onClick={() => {
                    applyPatch([ticket.id], { assigneeId: userId })
                    setOwnerOpen(false)
                  }}
                >
                  {resolveName(userId)}
                </button>
              ))}
              {ticket.assigneeId && (
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    applyPatch([ticket.id], { assigneeId: null })
                    setOwnerOpen(false)
                  }}
                >
                  {constants.context.removeAssignment}
                </button>
              )}
            </Popover>
          </span>
        </div>
      </section>
    </aside>
  )

  const withAside = (content: React.ReactNode) => (
    <div className={styles.body}>
      <div className={styles.main}>{content}</div>
      {contexto}
    </div>
  )

  /* No context column here: the DS Tabs mounts every panel at once, and five
       identical `complementary` landmarks would pile up (back with PD-111). */
  const pendingTab = (
    <div className={styles.body}>
      <section className={styles.block}>
        <p className={styles.pending}>{constants.tabPending}</p>
      </section>
    </div>
  )

  return (
    <div className={styles.screen}>
      <header className={styles.topbar}>
        {/* The queue path this ticket was opened from, person as the current item.
                     Going back reopens the same node — QueueView lives in the shell. */}
        <Breadcrumb separator="›">
          {[...view.labelPath, personName].map((label, index, all) =>
            index === all.length - 1 ? (
              <BreadcrumbItem key={`${index}-${label}`} current>
                {label}
              </BreadcrumbItem>
            ) : (
              <BreadcrumbItem key={`${index}-${label}`}>
                <Link to="/">{label}</Link>
              </BreadcrumbItem>
            ),
          )}
        </Breadcrumb>
      </header>

      {overdue !== null && overdue > 0 && ticket.actionDate !== null && (
        <div className={styles.banners}>
          <Banner variant="alert">
            {constants.overdue(overdue, formatDate(ticket.actionDate))}
          </Banner>
        </div>
      )}

      <div className={styles.pagehead}>
        <Heading level="h1">{personName}</Heading>
        <p className={styles.subtitle}>
          <span className={styles.ticketId}>{ticket.id}</span>
          <button
            type="button"
            className={styles.copy}
            aria-label={constants.copyId(ticket.id)}
            onClick={copyId}
          >
            {copied ? constants.copied : constants.copyGlyph}
          </button>
        </p>
      </div>

      <Tabs
        tabs={[
          {
            key: 'movimentacao',
            label: constants.tabs.movimentacao,
            content: withAside(
              <>
                {movimentacao}
                {timeline}
              </>,
            ),
          },
          { key: 'pessoa', label: constants.tabs.pessoa, content: pendingTab },
          { key: 'empresa', label: constants.tabs.empresa, content: pendingTab },
          { key: 'documentos', label: constants.tabs.documentos, content: pendingTab },
          { key: 'historico', label: constants.tabs.historico, content: pendingTab },
        ]}
      />
    </div>
  )
}
