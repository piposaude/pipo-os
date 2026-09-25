/** Cut from the prototype's dataset: every row a test names by id stays, plus a sample. */

import type { Company } from '@/lib/pipodesk/record'
import { isApiStatus, toDisplayStatus } from '@/lib/pipodesk/status'
import type { StructureState } from '@/lib/pipodesk/structure'
import type { Priority, Relationship, TicketRow } from '@/lib/pipodesk/ticket-row'
import raw from './dataset.json'

interface RawRow {
  id: string
  enrollmentId: string
  companyId: string
  status: string
  subject: string
  beneficiaryName: string | null
  taxId: string | null
  companyName: string | null
  parentCompanyId: string | null
  parentCompanyName: string | null
  companyTaxId?: string | null
  porte: string | null
  carrierId: string | null
  carrierName: string | null
  product: string | null
  enrollmentType: string
  contractType: string | null
  vinculo: string | null
  assigneeId: string | null
  groupId: string
  priority: string | null
  actionDate: string | null
  tags: string[]
  sourceSystem: string
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

const data = raw as unknown as {
  today: string
  viewerId: string
  users: { id: string; name: string }[]
  companies: Company[]
  structure: StructureState
  rows: RawRow[]
}

export const DATASET_TODAY = data.today
export const VIEWER_ID = data.viewerId

export const FIXTURE_USER_NAMES: Record<string, string> = Object.fromEntries(
  data.users.map((user) => [user.id, user.name]),
)

export const companiesFixture: Company[] = data.companies

export const structureFixture: StructureState = data.structure

export const VIEWER_GROUP_ID =
  structureFixture.memberships.find((membership) => membership.userId === VIEWER_ID)?.groupId ??
  'pod-5'

export const ANALYSTS_BY_POD: Record<string, string[]> = {}
for (const membership of structureFixture.memberships) {
  if (membership.role !== 'member') continue
  ;(ANALYSTS_BY_POD[membership.groupId] ??= []).push(membership.userId)
}

const RELATIONSHIP_OF: Record<string, Relationship> = {
  titular: 'holder',
  dependente: 'dependent',
  'grupo-familiar': 'family-group',
}

function toSeedRows(rows: RawRow[]): TicketRow[] {
  const seed: TicketRow[] = []
  for (const row of rows) {
    if (!isApiStatus(row.status)) throw new Error(`test row ${row.id}: status ${row.status}`)
    const display = toDisplayStatus(row.status)
    const { porte, vinculo, ...rest } = row
    seed.push({
      displayNumber: null,
      ...rest,
      status: row.status,
      display: display.status,
      reason: display.reason,
      companySize: porte,
      companyTaxId: row.companyTaxId ?? null,
      relationship: vinculo === null ? null : (RELATIONSHIP_OF[vinculo] ?? null),
      priority: row.priority as Priority | null,
    })
  }
  return seed
}

export const queueSeed: TicketRow[] = toSeedRows(data.rows)
