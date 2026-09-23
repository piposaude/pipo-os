/**
 * The prototype's dataset, exported by `scripts/export-fixture.mts` with the
 * vocabulary translated on the way out (6 statuses+reason → the 8 API ones,
 * audited pair by pair). Same counts, people and companies, so both apps can
 * be compared side by side. Replaced by the API once PD-043/PD-050 land.
 * How to regenerate lives in `apps/web/README.md`, and only there.
 */

import type { Company } from '@/lib/pipodesk/record'
import type { CompanyRecord } from '@/lib/pipodesk/search'
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
  /** Optional because the exporter does not emit it yet. Declared so the day
   *  it does, the row carries it instead of being flattened to null (PD-102). */
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
  inboxTicketIds: string[]
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

/** Company display names — including companies with no tickets, exactly what
 *  triage and the Carteiras tab show. */
export const COMPANY_NAMES: Record<string, string> = Object.fromEntries(
  data.companies.map((company) => [company.id, company.tradeName]),
)

/** Legal name and CNPJ by company id: the search needs both to tell apart the
 *  116 trade names the dataset shares between different companies. */
export const COMPANY_REGISTRY: Record<string, CompanyRecord> = Object.fromEntries(
  data.companies.map((company) => [
    company.id,
    { legalName: company.legalName, cnpj: company.cnpj },
  ]),
)

/** The companies as exported, SLA and parent included — the record tabs
 *  read them through `fixtures/pipodesk/records`. */
export const companiesFixture: Company[] = data.companies

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

/**
 * JSON carries the API status; `display`/`reason` are derived on load — same
 * contract as `ticket-row`. A row whose status is outside the vocabulary is
 * dropped with an error in the console, never mapped to a guess: this runs at
 * module scope, so throwing here kills the app during the import, before React
 * exists and out of reach of every error boundary. The fixture is regenerated
 * by a script in the prototype repo, so a drift there is a real possibility.
 */
/** Here and not in the exporter, so dataset.json stays regenerable. */
const RELATIONSHIP_OF: Record<string, Relationship> = {
  titular: 'holder',
  dependente: 'dependent',
  'grupo-familiar': 'family-group',
}

export function toSeedRows(rows: RawRow[]): TicketRow[] {
  const seed: TicketRow[] = []
  for (const row of rows) {
    if (!isApiStatus(row.status)) {
      console.error(
        `dataset: chamado ${row.id} ignorado — status "${row.status}" fora do vocabulário da API. Regere a fixture com o script do protótipo.`,
      )
      continue
    }
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
