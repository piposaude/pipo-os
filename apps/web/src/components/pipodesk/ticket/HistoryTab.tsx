import { useMemo, useState } from 'react'
import {
  Status,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@piposaude/design-system'
import { Link, useNavigate } from '@tanstack/react-router'
import { SortHeader, type SortState } from '@/components/pipodesk/primitives'
import sortHeader from '@/components/pipodesk/primitives/SortHeader.module.css'
import { ENROLLMENT_TYPE_COPY, PRODUCT_COPY } from '@/constants/pipodesk/domain'
import { DISPLAY_STATUS_COPY } from '@/constants/pipodesk/status'
import copy from '@/constants/pages/pipodesk/ticket/history'
import { formatNumericDate } from '@/lib/pipodesk/format'
import { historyOf, type TicketRecords } from '@/lib/pipodesk/record'
import { sortTickets, type SortField, type TicketSort } from '@/lib/pipodesk/sort'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import { RecordEmpty } from './RecordSection'
import detail from './DetailTable.module.css'
import styles from './HistoryTab.module.css'

export interface HistoryTabProps {
  ticket: TicketRow
  /** The queue rows as patched in this session, so a status change shows here too. */
  rows: TicketRow[]
  records: TicketRecords
}

const movementOf = (row: TicketRow): string => {
  const type = ENROLLMENT_TYPE_COPY[row.enrollmentType] ?? row.enrollmentType
  const product = row.product ? (PRODUCT_COPY[row.product] ?? row.product) : null
  return product ? `${type} · ${product}` : type
}

const DEFAULT_SORT: TicketSort = { by: 'createdAt', direction: 'desc' }

/** Always the ticket's beneficiary, never the person shown in Dados pessoais. */
export function HistoryTab({ ticket, rows, records }: HistoryTabProps) {
  const navigate = useNavigate()
  const [sort, setSort] = useState<TicketSort>(DEFAULT_SORT)
  const history = useMemo(() => historyOf(rows, records, ticket.id), [rows, records, ticket.id])
  const ordered = useMemo(() => sortTickets(history, sort), [history, sort])

  if (history.length === 0) return <RecordEmpty>{copy.empty}</RecordEmpty>

  const stateOf = (field: SortField): SortState => {
    if (sort.by !== field) return 'none'
    return sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  /* Only fields `TicketSort` knows: a key invented here would make this table
     and the queue disagree on what an order means. */
  const sortable = (field: SortField, label: string) => (
    <TableHeaderCell aria-sort={stateOf(field)}>
      <SortHeader
        label={label}
        state={stateOf(field)}
        onSort={() =>
          setSort({
            by: field,
            direction: sort.by === field && sort.direction === 'asc' ? 'desc' : 'asc',
          })
        }
      />
    </TableHeaderCell>
  )

  return (
    <div className={styles.tab}>
      <Table className={`${detail.table} ${sortHeader.table} ${styles.table}`}>
        <TableHead>
          <TableRow>
            <TableHeaderCell>{copy.columns.id}</TableHeaderCell>
            <TableHeaderCell>{copy.columns.movement}</TableHeaderCell>
            <TableHeaderCell>{copy.columns.carrier}</TableHeaderCell>
            {sortable('createdAt', copy.columns.openedAt)}
            {sortable('status', copy.columns.situation)}
          </TableRow>
        </TableHead>
        <TableBody>
          {ordered.map((item) => {
            const current = item.id === ticket.id
            return (
              <TableRow
                key={item.id}
                className={current ? detail.inert : undefined}
                data-row-target={current ? undefined : item.id}
                onClick={
                  current
                    ? undefined
                    : (event) => {
                        // The id link would navigate on its own; without this the
                        // row fires a second time on the same click.
                        if ((event.target as HTMLElement).closest('a')) return
                        void navigate({ to: '/tickets/$id', params: { id: item.id } })
                      }
                }
              >
                <TableCell>
                  {/* The current ticket is not a link to itself: a link that
                      leads nowhere is worse than text. */}
                  {current ? (
                    <span className={styles.current} aria-current="page">
                      {item.id}
                    </span>
                  ) : (
                    <Link to="/tickets/$id" params={{ id: item.id }}>
                      {item.id}
                    </Link>
                  )}
                </TableCell>
                <TableCell>{movementOf(item)}</TableCell>
                <TableCell>{item.carrierName ?? '—'}</TableCell>
                <TableCell>{formatNumericDate(item.createdAt)}</TableCell>
                <TableCell>
                  <Status variant="neutral">{DISPLAY_STATUS_COPY[item.display]}</Status>
                  {/* A second line, not a column: only the closed few have it. */}
                  {item.closedAt !== null && (
                    <span className={styles.closed}>
                      {copy.closedAt(formatNumericDate(item.closedAt))}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
