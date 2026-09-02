import { useMemo, useState, useRef } from 'react'
import { Banner, Breadcrumb, BreadcrumbItem, Button, Heading, Tabs } from '@piposaude/design-system'
import { Link, useParams } from '@tanstack/react-router'
import { useDesk } from '@/components/pipodesk/shell/desk-context'
import { Popover } from '@/components/pipodesk/primitives'
import { DISPLAY_STATUS_COPY, PENDING_REASON_COPY } from '@/constants/pipodesk/status'
import {
  ENROLLMENT_TYPE_COPY,
  PORTE_COPY,
  PRIORITY_COPY,
  PRODUCT_COPY,
  VINCULO_COPY,
} from '@/constants/pipodesk/domain'
import { ORIGIN_COPY } from '@/lib/pipodesk/filter-copy'
import { analystsOf } from '@/lib/pipodesk/permissions'
import { structureFixture } from '@/fixtures/pipodesk/dataset'
import { daysOverdue, formatDayMonth } from '@/lib/pipodesk/format'
import { CHANNELS, CHANNEL_LABEL, timelineOf, type CommentChannel } from '@/lib/pipodesk/timeline'
import type { Priority } from '@/lib/pipodesk/ticket-row'
import constants from '@/constants/pages/pipodesk/ticket'
import styles from './style.module.css'

const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low']

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
  const activeChannel = CHANNELS.find((option) => option.value === channel)!

  /** Analysts of the ticket's pod, from the structure — the same source the
   *  queue's batch reassign uses. Deriving it from who currently HOLDS a
   *  ticket would hide the analyst with an empty queue, who is exactly the
   *  person you want to hand work to. */
  const podAnalysts = analystsOf(structureFixture, ticket.groupId ?? '').map(
    (membership) => membership.userId,
  )

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(ticket.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
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
          label={constants.facts.vinculo}
          value={ticket.vinculo ? VINCULO_COPY[ticket.vinculo] : '—'}
        />
        <Fact
          label={constants.facts.porte}
          value={ticket.porte ? (PORTE_COPY[ticket.porte] ?? ticket.porte) : '—'}
        />
        <Fact
          label={constants.facts.actionDate}
          value={ticket.actionDate ? ticket.actionDate.split('-').reverse().join('/') : '—'}
        />
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
          {CHANNELS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.composerChannel}
              /* aria-pressed, not role="tab": there is no tabpanel to switch, and
                               promising one to screen readers would be a lie. */
              aria-pressed={channel === option.value}
              disabled={option.value === 'email'}
              onClick={() => setChannel(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {/* On screen, not in a `title`: a disabled button takes no focus and its
                     tooltip is not reliably announced, so the reason was mouse-only. */}
        <p className={styles.composerHint}>{constants.timeline.emailPending}</p>
        <p className={styles.composerHint}>{activeChannel.hint}</p>
        <textarea
          className={styles.composerInput}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            channel === 'email'
              ? constants.timeline.placeholderEmail
              : constants.timeline.placeholder
          }
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
            {channel === 'email' ? constants.timeline.submitEmail : constants.timeline.submit}
          </Button>
        </div>
      </div>
    </section>
  )

  const contexto = (
    <aside className={styles.context} aria-label="Contexto do chamado">
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
              aria-label={`${constants.context.priority}: ${
                ticket.priority ? PRIORITY_COPY[ticket.priority] : constants.context.noPriority
              }. Trocar`}
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
              {PRIORITY_ORDER.map((level) => (
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
                  {PRIORITY_COPY[level as string]}
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
              aria-label={`${constants.context.owner}: ${
                ticket.assigneeId ? resolveName(ticket.assigneeId) : constants.context.free
              }. Trocar`}
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
            {constants.overdue(overdue, ticket.actionDate.split('-').reverse().join('/'))}
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
            {copied ? constants.copied : '⧉'}
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
