/**
 * The prototype's dataset, exported by `scripts/export-pipo-os.ts` over there
 * with the vocabulary translated on the way out (6 statuses+reason → the 8 API
 * ones, audited pair by pair). Same counts, people and companies, so both apps
 * can be compared side by side. Replaced by the API once PD-043/PD-050 land.
 * Regenerate: `pnpm exec tsx scripts/export-pipo-os.ts <path>` in the
 * prototype repo.
 */

import { toDisplayStatus, type ApiStatus } from '@/lib/pipodesk/status'
import type { StructureState } from '@/lib/pipodesk/structure'
import type { Priority, TicketRow, Vinculo } from '@/lib/pipodesk/ticket-row'
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
  inboxTicketIds: string[]
  users: { id: string; name: string }[]
  companies: { id: string; tradeName: string; legalName: string; cnpj: string; porte: string }[]
  structure: StructureState
  rows: RawRow[]
}

export const DATASET_TODAY = data.today
export const VIEWER_ID = data.viewerId
export const INBOX_TICKET_IDS = data.inboxTicketIds

export const FIXTURE_USER_NAMES: Record<string, string> = Object.fromEntries(
  data.users.map((user) => [user.id, user.name]),
)

/** Company display names — including companies with no tickets, exactly what
 *  triage and the Carteiras tab show. */
export const COMPANY_NAMES: Record<string, string> = Object.fromEntries(
  data.companies.map((company) => [company.id, company.tradeName]),
)

export const structureFixture: StructureState = data.structure

export const ROOT_GROUP_ID =
  structureFixture.groups.find((group) => group.parentId === null)?.id ?? 'group-geben'

export const VIEWER_GROUP_ID =
  structureFixture.memberships.find((membership) => membership.userId === VIEWER_ID)?.groupId ??
  'pod-5'

export const ANALYSTS_BY_POD: Record<string, string[]> = {}
for (const membership of structureFixture.memberships) {
  if (membership.role !== 'member') continue
  ;(ANALYSTS_BY_POD[membership.groupId] ??= []).push(membership.userId)
}

/** JSON carries the API status; `display`/`reason` are derived on load —
 *  same contract as `ticket-row`. */
export const queueSeed: TicketRow[] = data.rows.map((row) => {
  const display = toDisplayStatus(row.status as ApiStatus)
  return {
    displayNumber: null,
    ...row,
    status: row.status as ApiStatus,
    display: display.status,
    reason: display.reason,
    vinculo: row.vinculo as Vinculo | null,
    priority: row.priority as Priority | null,
  }
})
