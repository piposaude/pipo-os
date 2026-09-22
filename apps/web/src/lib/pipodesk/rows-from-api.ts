import { businessDay } from '@/lib/date'
import { isApiStatus, toDisplayStatus } from './status'
import { buildSubject, type Priority, type Relationship, type TicketRow } from './ticket-row'

export interface ApiTicketRow {
  id: string
  displayNumber: string
  enrollmentId: string
  companyId: string
  status: string
  title: string | null
  beneficiaryName: string | null
  taxId: string | null
  companyName: string | null
  parentCompanyId: string | null
  parentCompanyName: string | null
  companyTaxId: string | null
  companySize: string | null
  carrierId: string | null
  carrierName: string | null
  product: string | null
  enrollmentType: string
  contractType: string | null
  relationship: Relationship | null
  assigneeId: string | null
  groupId: string | null
  priority: string | null
  actionDate: string | null
  tags: string[]
  sourceSystem: string
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

export function rowsFromApi(rows: ApiTicketRow[]): TicketRow[] {
  const seen: TicketRow[] = []

  for (const row of rows) {
    if (!isApiStatus(row.status)) {
      console.error(
        `fila: chamado ${row.id} ignorado — status "${row.status}" fora do vocabulário desta versão.`,
      )
      continue
    }

    const { status: display, reason } = toDisplayStatus(row.status)
    const { title, ...rest } = row

    seen.push({
      ...rest,
      status: row.status,
      display,
      reason,
      subject: buildSubject({
        id: row.id,
        title,
        carrierName: row.carrierName,
        product: row.product,
        beneficiaryName: row.beneficiaryName,
      }),
      /* The projection sends an instant; the queue compares days as strings,
         and the business timezone decides which day an instant belongs to. */
      actionDate: row.actionDate === null ? null : businessDay(row.actionDate),
      priority: row.priority as Priority | null,
    })
  }

  return seen
}
