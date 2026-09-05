// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { businessDay } from '@/lib/date'
import { applyFilter, windowOf, type TicketFilter, type WindowMode } from '@/lib/pipodesk/filter'
import type { Priority, TicketRow } from '@/lib/pipodesk/ticket-row'

/** Twin of filter-resolver.contract.test.ts in apps/api: change one, change both. */
const CASES_PATH = fileURLToPath(
  new URL('../../../../../../contract/ticket-filter-cases.json', import.meta.url),
)

type FixtureTicket = {
  id: string
  status: string
  companyId: string
  enrollmentType: string
  sourceSystem: string
  groupId: string | null
  assigneeId: string | null
  priority: string | null
  tags: string[]
  actionDate: string | null
  createdAt: string
  closedAt: string | null
  carrierId: string
  relationship: string
  stored: { product: string; contractType: string | null; companySize: string }
  client: { product: string; contractType: string | null; companySize: string }
}

type CaseFile = {
  viewerId: string
  today: string
  tickets: FixtureTicket[]
  cases: { name: string; filter: TicketFilter; window?: WindowMode; expected: string[] }[]
}

const fixture = JSON.parse(readFileSync(CASES_PATH, 'utf8')) as CaseFile

const toRow = (seed: FixtureTicket): TicketRow => ({
  id: seed.id,
  displayNumber: null,
  enrollmentId: 'e',
  companyId: seed.companyId,
  status: seed.status as TicketRow['status'],
  display: 'broker-processing',
  reason: null,
  subject: seed.id,
  beneficiaryName: null,
  taxId: null,
  companyName: null,
  companySize: seed.client.companySize,
  carrierId: seed.carrierId,
  carrierName: null,
  product: seed.client.product,
  enrollmentType: seed.enrollmentType,
  contractType: seed.client.contractType,
  relationship: seed.relationship as TicketRow['relationship'],
  assigneeId: seed.assigneeId,
  groupId: seed.groupId,
  priority: seed.priority as Priority | null,
  // The row carries the São Paulo day, as `toTicketRow` derives it from the instant.
  actionDate: seed.actionDate === null ? null : businessDay(seed.actionDate),
  tags: seed.tags,
  sourceSystem: seed.sourceSystem,
  createdAt: seed.createdAt,
  updatedAt: seed.createdAt,
  closedAt: seed.closedAt,
})

describe('the shared filter corpus, resolved in memory', () => {
  const rows = fixture.tickets.map(toRow)

  it.each(fixture.cases.map((testCase) => [testCase.name, testCase] as const))(
    'should select the expected set for: %s',
    (_name, testCase) => {
      const selected = windowOf(
        applyFilter(rows, testCase.filter, fixture.viewerId),
        testCase.window ?? 'all',
        fixture.today,
      )
        .map((row) => row.id)
        .sort()

      expect(selected).toEqual([...testCase.expected].sort())
    },
  )
})
