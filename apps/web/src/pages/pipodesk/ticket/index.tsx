import { useMemo, useRef, useState } from 'react'
import {
  Banner,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Heading,
  Loading,
  Tabs,
} from '@piposaude/design-system'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { components } from '@pipo-os/api-client'
import { useDesk } from '@/components/pipodesk/shell/desk-context'
import { SidebarToggle } from '@/components/pipodesk/shell/SidebarToggle'
import { CompanyTab } from '@/components/pipodesk/ticket/CompanyTab'
import { CopyButton } from '@/components/pipodesk/ticket/CopyButton'
import { DocumentsTab } from '@/components/pipodesk/ticket/DocumentsTab'
import { HistoryTab } from '@/components/pipodesk/ticket/HistoryTab'
import { PersonTab } from '@/components/pipodesk/ticket/PersonTab'
import { RecordEmpty } from '@/components/pipodesk/ticket/RecordSection'
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
import { daysOverdue, formatDate, formatDayMonth, formatLongDate } from '@/lib/pipodesk/format'
import {
  CHANNELS,
  CHANNEL_LABEL,
  CHANNEL_ORDER,
  commentBodyOf,
  timelineFromApi,
  type CommentChannel,
} from '@/lib/pipodesk/timeline'
import { isApiStatus } from '@/lib/pipodesk/status'
import { recordsFromTicket } from '@/lib/pipodesk/snapshot'
import { PRIORITIES, toTicketRow } from '@/lib/pipodesk/ticket-row'
import { ApiError, client } from '@/lib/api'
import constants from '@/constants/pages/pipodesk/ticket'
import recordCopy from '@/constants/pages/pipodesk/ticket/record'
import styles from './style.module.css'

type TimelineItem = components['schemas']['TimelineItem']

const TIMELINE_PAGE = 200

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
 * completion form/gates, suggestions and attachments (PD-112).
 */
export default function TicketPage() {
  const { id } = useParams({ from: '/_auth/_desk/tickets/$id' })
  return <TicketDetail key={id} id={id} />
}

function TicketDetail({ id }: { id: string }) {
  const { view, structure, rows, today, resolveName, applyPatch, patchRow } = useDesk()

  const ticketQuery = useQuery({
    queryKey: ['get', '/api/tickets/{id}', id],
    queryFn: async () => {
      try {
        const { data } = await client.GET('/api/tickets/{id}', { params: { path: { id } } })
        return data ?? null
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  })
  const unreadable = ticketQuery.data ? !isApiStatus(ticketQuery.data.status) : false
  const records = useMemo(
    () => (ticketQuery.data ? recordsFromTicket(ticketQuery.data) : null),
    [ticketQuery.data],
  )
  const ticket = useMemo(
    () =>
      ticketQuery.data && isApiStatus(ticketQuery.data.status)
        ? patchRow(toTicketRow(ticketQuery.data))
        : undefined,
    [ticketQuery.data, patchRow],
  )

  const [priorityOpen, setPriorityOpen] = useState(false)
  const [ownerOpen, setOwnerOpen] = useState(false)
  const priorityTrigger = useRef<HTMLButtonElement>(null)
  const ownerTrigger = useRef<HTMLButtonElement>(null)
  const [channel, setChannel] = useState<CommentChannel>('internal')
  const [draft, setDraft] = useState('')
  const [shownPerson, setShownPerson] = useState<string | null>(null)

  const timelineQuery = useQuery({
    queryKey: ['get', '/api/tickets/{id}/timeline', id],
    queryFn: async () => {
      const items: TimelineItem[] = []
      let cursor: string | undefined
      do {
        const { data } = await client.GET('/api/tickets/{id}/timeline', {
          params: { path: { id }, query: { limit: TIMELINE_PAGE, cursor } },
        })
        if (!data) break
        items.push(...data.data)
        cursor = data.nextCursor
      } while (cursor)
      return items
    },
  })
  const { refetch: refetchTimeline } = timelineQuery
  const events = useMemo(
    () => (ticket ? timelineFromApi(ticket, timelineQuery.data ?? [], resolveName) : []),
    [ticket, timelineQuery.data, resolveName],
  )

  const comment = useMutation({
    mutationFn: (body: ReturnType<typeof commentBodyOf>) =>
      client.POST('/api/tickets/{id}/comments', { params: { path: { id } }, body }),
    onSuccess: async (_, sent) => {
      setDraft((current) => (current.trim() === sent.body ? '' : current))
      await refetchTimeline()
    },
  })

  /** Analysts of the ticket's pod, from the structure — the same source the
   *  queue's batch reassign uses. Deriving it from who currently HOLDS a
   *  ticket would hide the analyst with an empty queue, who is exactly the
   *  person you want to hand work to. Above the early return because it is a
   *  hook: an absent ticket has no pod, and `''` matches no group. */
  const podAnalysts = useMemo(
    () => analystsOf(structure, ticket?.groupId ?? '').map(({ userId }) => userId),
    [structure, ticket?.groupId],
  )

  if (!ticket || !records) {
    return (
      <div className={`${styles.screen} ${styles.missing}`}>
        {ticketQuery.isPending ? (
          <Loading show variant="contained" role="status" />
        ) : ticketQuery.isError || unreadable ? (
          <p>{constants.loadFailed(id)}</p>
        ) : (
          <p>{constants.notFound(id)}</p>
        )}
      </div>
    )
  }

  const personName = ticket.beneficiaryName ?? ticket.subject
  const movement = records.movementOf(ticket.id)
  const shownPersonId = shownPerson ?? movement?.beneficiaryId ?? null
  /* `null` for no action date AND for one that cannot be read — an unreadable
     date is not an overdue deadline. */
  const overdue = ticket.actionDate === null ? null : daysOverdue(ticket.actionDate, today)
  const activeChannel = CHANNELS[channel]

  const situacao = ticket.reason
    ? `${DISPLAY_STATUS_COPY[ticket.display]} · ${PENDING_REASON_COPY[ticket.reason]}`
    : DISPLAY_STATUS_COPY[ticket.display]

  const company = records.companyById.get(ticket.companyId)
  /* The ticket's own column decides it, not whether the record resolved: a
     snapshot without the parent would make a branch ticket claim the parent's. */
  const isBranch = ticket.parentCompanyId !== null
  const parentCompany = ticket.parentCompanyId
    ? records.companyById.get(ticket.parentCompanyId)
    : undefined

  const movimentacao = (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>{constants.facts.heading}</h2>
      {isBranch && (
        /* `important` is the DS beige for an informative notice; `warning`
           would read as an alert where there is none. */
        <Banner variant="important" icon={false} className={styles.branchNotice}>
          {constants.facts.branchNotice(ticket.enrollmentType)}{' '}
          <strong>{company?.tradeName ?? ticket.companyName ?? '—'}</strong>
        </Banner>
      )}
      <dl className={styles.facts}>
        {isBranch ? (
          <>
            <Fact
              label={constants.facts.parentCompany}
              value={parentCompany?.tradeName ?? ticket.parentCompanyName ?? '—'}
            />
            <Fact label={constants.facts.cnpj} value={parentCompany?.cnpj ?? '—'} />
            <Fact
              label={constants.facts.branchCompany}
              value={company?.tradeName ?? ticket.companyName ?? '—'}
            />
            <Fact label={constants.facts.cnpj} value={company?.cnpj ?? '—'} />
          </>
        ) : (
          <>
            <Fact label={constants.facts.company} value={ticket.companyName ?? '—'} />
            <Fact label={constants.facts.structure} value={constants.facts.isParent} />
            <Fact label={constants.facts.cnpj} value={company?.cnpj ?? '—'} />
          </>
        )}
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
      {timelineQuery.isError && (
        <p className={styles.composerHint}>{constants.timeline.loadFailed}</p>
      )}
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
        {comment.isError && (
          <p role="alert" className={styles.composerHint}>
            {constants.timeline.sendFailed}
          </p>
        )}
        <div className={styles.composerActions}>
          <Button
            variant="primary"
            disabled={draft.trim().length === 0 || comment.isPending}
            onClick={() => {
              if (channel === 'email') return
              comment.mutate(commentBodyOf(channel, draft.trim()))
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
          <span className={styles.pillLabel}>{constants.context.actionDate}</span>
          <input
            type="date"
            className={`${styles.pillAction} ${styles.pillDate}`}
            value={ticket.actionDate ?? ''}
            aria-label={
              ticket.actionDate
                ? constants.context.changeLabel(
                    constants.context.actionDate,
                    formatDate(ticket.actionDate),
                  )
                : constants.context.noActionDate
            }
            onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) =>
              applyPatch([ticket.id], { actionDate: event.target.value || null })
            }
          />
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

  const pessoa =
    shownPersonId === null ? (
      <RecordEmpty>{recordCopy.notFound.person}</RecordEmpty>
    ) : (
      <PersonTab
        personId={shownPersonId}
        records={records}
        capturedAt={ticket.createdAt}
        onSelectPerson={setShownPerson}
      />
    )

  const empresa = (
    <CompanyTab
      companyId={ticket.companyId}
      policyId={movement?.policyId}
      records={records}
      capturedAt={ticket.createdAt}
      today={today}
    />
  )

  const documentos = (
    <DocumentsTab
      ticket={ticket}
      pendingDocumentation={movement?.pendingDocumentation ?? null}
      records={records}
    />
  )

  const historico = <HistoryTab ticket={ticket} rows={rows} />

  return (
    <div className={styles.screen}>
      <header className={styles.topbar}>
        <SidebarToggle />
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
            <strong>{constants.overdueLead(overdue)}</strong>{' '}
            {constants.overdueDate(formatLongDate(ticket.actionDate))}
          </Banner>
        </div>
      )}

      <div className={styles.pagehead}>
        <Heading level="h1">{personName}</Heading>
        <p className={styles.subtitle}>
          <span className={styles.ticketId}>{ticket.id}</span>
          {/* Revealed on hover of the header (`.pagehead`), as in the prototype. */}
          <CopyButton value={ticket.id} label={constants.copyId(ticket.id)} />
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
          { key: 'pessoa', label: constants.tabs.pessoa, content: withAside(pessoa) },
          { key: 'empresa', label: constants.tabs.empresa, content: withAside(empresa) },
          {
            key: 'documentos',
            label: constants.tabs.documentos,
            content: withAside(documentos),
          },
          { key: 'historico', label: constants.tabs.historico, content: withAside(historico) },
        ]}
      />
    </div>
  )
}
