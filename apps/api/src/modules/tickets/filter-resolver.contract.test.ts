import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import type { TicketFilter } from './filter-schema.js'
import {
  actionDateWindowCondition,
  ticketFilterConditions,
  type ActionDateWindow,
} from './filter-resolver.js'

/** Twin of filter-contract.test.ts in apps/web: change one, change both. */
const CASES_PATH = fileURLToPath(
  new URL('../../../../../contract/ticket-filter-cases.json', import.meta.url),
)

type FixtureTicket = {
  id: string
  title: string | null
  carrierName: string | null
  beneficiaryName: string | null
  status: string
  companyId: string
  parentCompanyId: string | null
  parentCompanyName: string | null
  companyTaxId: string | null
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
  groupA: string
  tickets: FixtureTicket[]
  cases: { name: string; filter: TicketFilter; window?: ActionDateWindow; expected: string[] }[]
}

const fixture = JSON.parse(readFileSync(CASES_PATH, 'utf8')) as CaseFile

/** Every column the subject is built from is the corpus's own, so the case id
 *  rides on `enrollment_id`, which nothing reads. */
const enrollmentIdByCase = new Map(fixture.tickets.map((seed) => [seed.id, randomUUID()] as const))
const caseIdByEnrollment = new Map(
  [...enrollmentIdByCase].map(([caseId, enrollmentId]) => [enrollmentId as string, caseId]),
)

describe('the shared filter corpus, resolved in SQL', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    await app.db.deleteFrom('tickets').execute()
    // tickets.group_id carries an FK, so the pod has to exist before the rows do.
    await app.db
      .insertInto('ticket_groups')
      .values({ id: fixture.groupA, name: 'POD contrato', created_by: fixture.viewerId })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await app.db
      .insertInto('tickets')
      .values(
        fixture.tickets.map((seed) => ({
          enrollment_id: enrollmentIdByCase.get(seed.id)!,
          enrollment_type: seed.enrollmentType,
          company_id: seed.companyId,
          parent_company_id: seed.parentCompanyId,
          parent_company_name: seed.parentCompanyName,
          company_tax_id: seed.companyTaxId,
          source_system: seed.sourceSystem,
          status: seed.status,
          group_id: seed.groupId,
          assignee_id: seed.assigneeId,
          priority: seed.priority,
          tags: seed.tags,
          action_date: seed.actionDate,
          created_at: seed.createdAt,
          closed_at: seed.closedAt,
          carrier_id: seed.carrierId,
          relationship: seed.relationship,
          product: seed.stored.product,
          contract_type: seed.stored.contractType,
          company_size: seed.stored.companySize,
          title: seed.title,
          carrier_name: seed.carrierName,
          enrollment_snapshot: JSON.stringify({
            primary: { profile: { 'preferred-name': seed.beneficiaryName } },
          }),
        })),
      )
      .execute()
  })

  afterAll(async () => {
    await app.db.deleteFrom('tickets').execute()
    await app.db.deleteFrom('ticket_groups').where('id', '=', fixture.groupA).execute()
    await app.close()
  })

  it.each(fixture.cases.map((testCase) => [testCase.name, testCase] as const))(
    'should select the expected set for: %s',
    async (_name, testCase) => {
      const rows = await app.db
        .selectFrom('tickets')
        .select('enrollment_id')
        .where((eb) => {
          const parts = ticketFilterConditions(eb, testCase.filter, fixture.viewerId)
          const window = testCase.window
            ? actionDateWindowCondition(testCase.window, fixture.today)
            : null
          return eb.and(window ? [...parts, window] : parts)
        })
        .execute()
      const selected = rows.map((row) => caseIdByEnrollment.get(row.enrollment_id)!).sort()

      expect(selected).toEqual([...testCase.expected].sort())
    },
  )
})
