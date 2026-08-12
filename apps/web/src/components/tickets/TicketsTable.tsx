import { useState } from 'react'
import {
  Icon,
  IconButton,
  PopoverMenu,
  PopoverMenuItem,
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
  onChangeStatus: (id: string, status: TicketStatus) => void
  onDelete: (id: string) => void
}

const statusVariant: Record<TicketStatus, StatusVariant> = {
  open: 'waiting',
  in_progress: 'warning',
  closed: 'success',
}

const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'closed']

export function TicketsTable({ tickets, labels, onChangeStatus, onDelete }: TicketsTableProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

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
            <TableCell>{ticket.title}</TableCell>
            <TableCell>{ticket.description}</TableCell>
            <TableCell>
              <Status variant={statusVariant[ticket.status]}>{labels.status[ticket.status]}</Status>
            </TableCell>
            <TableCell className={styles.createdAt}>{formatDateTime(ticket.createdAt)}</TableCell>
            <TableCell>
              <div className={styles.actionsCell}>
                <PopoverMenu
                  isOpen={openMenuId === ticket.id}
                  onClose={() => setOpenMenuId(null)}
                  placement="bottom-end"
                  trigger={
                    <IconButton
                      variant="neutral"
                      size="sm"
                      icon={<Icon name="fill/pencil" size="sm" />}
                      aria-label={labels.changeStatus}
                      onClick={() =>
                        setOpenMenuId((current) => (current === ticket.id ? null : ticket.id))
                      }
                    />
                  }
                >
                  {TICKET_STATUSES.map((status) => (
                    <PopoverMenuItem
                      key={status}
                      disabled={status === ticket.status}
                      onClick={() => onChangeStatus(ticket.id, status)}
                    >
                      {labels.status[status]}
                    </PopoverMenuItem>
                  ))}
                </PopoverMenu>
                <IconButton
                  variant="neutral"
                  size="sm"
                  icon={<Icon name="fill/trash" size="sm" />}
                  aria-label={labels.delete}
                  onClick={() => onDelete(ticket.id)}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
