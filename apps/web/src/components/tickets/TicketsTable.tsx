import {
  Icon,
  IconButton,
  Status,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  type StatusVariant,
} from '@piposaude/design-system'
import type { Ticket, TicketStatus } from '@pipo-os/api-client'
import { formatDateTime } from '@/lib/date'
import styles from './TicketsTable.module.css'

export interface TicketsTableLabels {
  headers: {
    title: string
    description: string
    status: string
    createdAt: string
    actions: string
  }
  status: Record<TicketStatus, string>
  changeStatus: string
  delete: string
}

export interface TicketsTableProps {
  tickets: Ticket[]
  labels: TicketsTableLabels
}

const statusVariant: Record<TicketStatus, StatusVariant> = {
  open: 'waiting',
  in_progress: 'warning',
  closed: 'success',
}

export function TicketsTable({ tickets, labels }: TicketsTableProps) {
  return (
    <Table hoverable>
      <TableHead>
        <TableRow>
          <TableHeaderCell>{labels.headers.title}</TableHeaderCell>
          <TableHeaderCell>{labels.headers.description}</TableHeaderCell>
          <TableHeaderCell>{labels.headers.status}</TableHeaderCell>
          <TableHeaderCell>{labels.headers.createdAt}</TableHeaderCell>
          <TableHeaderCell>{labels.headers.actions}</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell>{ticket.enrollmentType}</TableCell>
            <TableCell>{ticket.sourceSystem}</TableCell>
            <TableCell>
              <Status variant={statusVariant[ticket.status]}>{labels.status[ticket.status]}</Status>
            </TableCell>
            <TableCell className={styles.createdAt}>{formatDateTime(ticket.createdAt)}</TableCell>
            <TableCell>
              <div className={styles.actionsCell}>
                <IconButton
                  disabled
                  variant="neutral"
                  size="sm"
                  icon={<Icon name="fill/pencil" size="sm" />}
                  aria-label={labels.changeStatus}
                />
                <IconButton
                  disabled
                  variant="neutral"
                  size="sm"
                  icon={<Icon name="fill/trash" size="sm" />}
                  aria-label={labels.delete}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
