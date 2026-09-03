import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import type { TicketFilter } from './filter-schema.js'
import { ticketFilterConditions } from './filter-resolver.js'

/**
 * The SQL half of the PD-043 invariant. The web half runs `matchesFilter` over
 * the same tickets and the same cases; both assert the same ids, so the two
 * implementations cannot drift into a node that announces one number and lists
 * another.
 */
const CASES_PATH = fileURLToPath(
  new URL('../../../../../contract/ticket-filter-cases.json', import.meta.url),
)

type Seed = {
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
}

type Corpus = {
  viewerId: string
  groupA: string
  tickets: Seed[]
  cases: { name: string; filter: TicketFilter; expected: string[] }[]
}

const corpus = JSON.parse(readFileSync(CASES_PATH, 'utf8')) as Corpus

describe('the shared filter corpus, resolved in SQL', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    await app.db.deleteFrom('tickets').execute()
    // tickets.group_id carries an FK, so the pod has to exist before the rows do.
    await app.db
      .insertInto('ticket_groups')
      .values({ id: corpus.groupA, name: 'POD contrato', created_by: corpus.viewerId })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
    await app.db
      .insertInto('tickets')
      .values(
        corpus.tickets.map((seed) => ({
          enrollment_id: randomUUID(),
          enrollment_type: seed.enrollmentType,
          company_id: seed.companyId,
          source_system: seed.sourceSystem,
          status: seed.status,
          group_id: seed.groupId,
          assignee_id: seed.assigneeId,
          priority: seed.priority,
          tags: seed.tags,
          action_date: seed.actionDate,
          created_at: seed.createdAt,
          closed_at: seed.closedAt,
          title: seed.id,
        })),
      )
      .execute()
  })

  afterAll(async () => {
    await app.db.deleteFrom('tickets').execute()
    await app.db.deleteFrom('ticket_groups').where('id', '=', corpus.groupA).execute()
    await app.close()
  })

  it.each(corpus.cases.map((testCase) => [testCase.name, testCase] as const))(
    'should select the expected set for: %s',
    async (_name, testCase) => {
      const rows = await app.db
        .selectFrom('tickets')
        .select('title')
        .where((eb) => eb.and(ticketFilterConditions(eb, testCase.filter, corpus.viewerId)))
        .execute()
      const selected = rows.map((row) => row.title!).sort()

      expect(selected).toEqual([...testCase.expected].sort())
    },
  )
})
