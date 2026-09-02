import { CarrierLogo, Status } from '@piposaude/design-system'
import { DISPLAY_STATUS_COPY, PENDING_REASON_COPY } from '@/constants/pipodesk/status'
import { ENROLLMENT_TYPE_COPY, PRODUCT_COPY, RELATIONSHIP_COPY } from '@/constants/pipodesk/domain'
import type { QueueColumn } from '@/lib/pipodesk/columns'
import { formatDayMonth, formatPrazo, prazoVariant } from '@/lib/pipodesk/format'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import constants from '@/constants/pages/pipodesk/queue'
import styles from './Queue.module.css'

/** Carrier NAME → DS logo slug (from the prototype). The name, not the id —
 *  the dataset ids are `carrier-N`. No `if` fallback: `CarrierLogo` falls back
 *  to the generic mark on its own (Vidalink, Petlove). `Unimed Mineira` is the
 *  one real approximation — registered gap. */
const CARRIER_SLUG: Record<string, string> = {
  SulAmérica: 'sulamerica',
  'Porto Seguro': 'porto-seguro',
  'Bradesco Saúde': 'bradesco',
  Amil: 'amil',
  'NotreDame Intermédica': 'gndi',
  MetLife: 'metlife',
  Wellhub: 'wellhub',
  'Unimed Mineira': 'seguros-unimed',
}

/** Classification chip color — presentation decision, lives here. */
const CLASSIFICATION: Record<string, 'neutral' | 'warning' | 'alert' | 'success'> = {
  inclusion: 'success',
  exclusion: 'alert',
  plan_change: 'warning',
  registration_data_change: 'neutral',
}

export interface QueueRowProps {
  ticket: TicketRow
  columns: QueueColumn[]
  selected: boolean
  onToggleSelect: (id: string) => void
  today: string
  resolveName: (userId: string) => string
}

/** The deadline chip, or nothing. `prazoVariant` is the single decision: it
 *  returns `null` both for no action date and for one that cannot be read. */
function prazoOf(actionDate: string | null, today: string) {
  const variant = prazoVariant(actionDate, today)
  if (variant === null || actionDate === null) return null
  return (
    <Status variant={variant} className={styles.rowChip}>
      {formatPrazo(actionDate, today)}
    </Status>
  )
}

export function QueueRow({
  ticket,
  columns,
  selected,
  onToggleSelect,
  today,
  resolveName,
}: QueueRowProps) {
  const reason = ticket.reason ? PENDING_REASON_COPY[ticket.reason] : null
  // The operational number (PD-011) is what the analyst reads out loud;
  // the internal id stands in until the API sends one.
  const number = ticket.displayNumber ?? ticket.id

  const cells: Record<string, React.ReactNode> = {
    select: (
      <td key="select" className={styles.selectCell}>
        <input
          type="checkbox"
          checked={selected}
          aria-label={`${constants.selectRow} ${number}`}
          onChange={() => onToggleSelect(ticket.id)}
          onClick={(event) => event.stopPropagation()}
        />
      </td>
    ),
    id: (
      <td key="id" className={styles.num}>
        {number}
      </td>
    ),
    assignee: (
      <td key="assignee">
        {ticket.assigneeId ? (
          <span className={styles.avatar} title={resolveName(ticket.assigneeId)}>
            {resolveName(ticket.assigneeId)
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() ?? '')
              .join('')}
          </span>
        ) : (
          <span className={styles.free} title={constants.free} aria-label={constants.free} />
        )}
      </td>
    ),
    /* Hierarchy is order and color, not vertical position: carrier medium,
           product and person secondary, one line. The person yields space first;
           `title` keeps the full subject. */
    subject: (
      <td key="subject" title={ticket.subject}>
        <div className={styles.subject}>
          {ticket.carrierName && (
            <CarrierLogo
              carrier={CARRIER_SLUG[ticket.carrierName] ?? ticket.carrierName}
              size="xs"
              className={styles.carrierLogo}
            />
          )}
          <span className={styles.subjectCarrier}>
            {ticket.carrierName ?? constants.empty_cell}
          </span>
          {ticket.product && (
            <span className={styles.subjectProduct}>
              {PRODUCT_COPY[ticket.product] ?? ticket.product}
            </span>
          )}
          <span className={styles.subjectName}>{ticket.beneficiaryName ?? ticket.subject}</span>
        </div>
      </td>
    ),
    classification: (
      <td key="classification">
        <Status
          variant={CLASSIFICATION[ticket.enrollmentType] ?? 'neutral'}
          className={styles.rowChip}
        >
          {ENROLLMENT_TYPE_COPY[ticket.enrollmentType] ?? ticket.enrollmentType}
        </Status>
      </td>
    ),
    relationship: (
      <td key="relationship" className={styles.secondary}>
        {ticket.relationship ? RELATIONSHIP_COPY[ticket.relationship] : constants.empty_cell}
      </td>
    ),
    company: (
      <td key="company" title={ticket.companyName ?? undefined}>
        {ticket.companyName ?? constants.empty_cell}
      </td>
    ),
    /* Internal copy, for the analyst. The reason lives ONLY in `title`, like
           the prototype: inline it truncated the cell and was noise across
           hundreds of rows. */
    status: (
      <td key="status" title={reason ?? undefined}>
        {DISPLAY_STATUS_COPY[ticket.display]}
      </td>
    ),
    createdAt: (
      <td key="createdAt" className={`${styles.secondary} ${styles.num}`}>
        {formatDayMonth(ticket.createdAt, today)}
      </td>
    ),
    updatedAt: (
      <td key="updatedAt" className={`${styles.secondary} ${styles.num}`}>
        {formatDayMonth(ticket.updatedAt, today)}
      </td>
    ),
    /* Empty on most rows, no dash — a column of dashes is noise. The variant
           decides whether there is a chip at all: no date, or a date that does
           not read, means no deadline to show. */
    prazo: (
      <td key="prazo" className={`${styles.num} ${styles.right}`}>
        {prazoOf(ticket.actionDate, today)}
      </td>
    ),
  }

  return <>{columns.map((column) => cells[column.key])}</>
}
