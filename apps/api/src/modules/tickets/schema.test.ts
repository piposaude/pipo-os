import type { FastifyInstance } from 'fastify'
import type { Kysely } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import * as podRequired from '../../migrations/0033_tickets_group_id_not_null.js'
import { NOT_NULL_VIOLATION, codeOf } from '../../shared/pg.test-helpers.js'
import { createRootGroup } from '../groups/root.test-helpers.js'

const CARRIED = '00000000-0000-4000-8000-0000000000c1'
const UNCARRIED = '00000000-0000-4000-8000-0000000000c2'

describe('tickets schema — every ticket is in a pod', () => {
  let app: FastifyInstance
  let rootGroupId: string
  let pod: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)
    const row = await app.db
      .insertInto('ticket_groups')
      .values({ name: 'POD 3', parent_id: rootGroupId, created_by: 'test' })
      .returning('id')
      .executeTakeFirstOrThrow()
    pod = row.id
    await app.db
      .insertInto('ticket_group_companies')
      .values({ group_id: pod, company_id: CARRIED })
      .execute()
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_group_companies').where('group_id', '=', pod).execute()
    await app.db.deleteFrom('ticket_groups').where('id', 'in', [pod, rootGroupId]).execute()
    await app.close()
  })

  afterEach(async () => {
    await app.db.deleteFrom('tickets').execute()
  })

  const ticket = (companyId: string, enrollmentId: string, groupId: string | null) =>
    app.db
      .insertInto('tickets')
      .values({
        enrollment_id: enrollmentId,
        enrollment_type: 'inclusion',
        company_id: companyId,
        source_system: 'test',
        enrollment_snapshot: '{}',
        status: 'broker-processing',
        // The column refuses null at compile time too; the cast is the write
        // the constraint exists to stop.
        group_id: groupId as string,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

  it('refuses a ticket with no pod', async () => {
    expect(await codeOf(ticket(CARRIED, '00000000-0000-4000-8000-000000000101', null))).toBe(
      NOT_NULL_VIOLATION,
    )
  })

  it('puts a ticket written before it in the pod of its portfolio, and in the root without one', async () => {
    const db = app.db as unknown as Kysely<unknown>
    await podRequired.down(db)
    try {
      await ticket(CARRIED, '00000000-0000-4000-8000-000000000102', null)
      await ticket(UNCARRIED, '00000000-0000-4000-8000-000000000103', null)
      await ticket(UNCARRIED, '00000000-0000-4000-8000-000000000104', pod)
    } finally {
      await podRequired.up(db)
    }

    const rows = await app.db
      .selectFrom('tickets')
      .select(['enrollment_id', 'group_id'])
      .orderBy('enrollment_id')
      .execute()
    expect(rows).toEqual([
      { enrollment_id: '00000000-0000-4000-8000-000000000102', group_id: pod },
      { enrollment_id: '00000000-0000-4000-8000-000000000103', group_id: rootGroupId },
      // Already in a pod: the backfill does not second-guess it.
      { enrollment_id: '00000000-0000-4000-8000-000000000104', group_id: pod },
    ])
  })
})

describe('tickets schema — the backfill with nowhere to put a ticket', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('stops, instead of leaving a ticket with no pod, when there is no root group', async () => {
    const db = app.db as unknown as Kysely<unknown>
    await podRequired.down(db)
    try {
      await app.db
        .insertInto('tickets')
        .values({
          enrollment_id: '00000000-0000-4000-8000-000000000105',
          enrollment_type: 'inclusion',
          company_id: UNCARRIED,
          source_system: 'test',
          enrollment_snapshot: '{}',
          status: 'broker-processing',
        } as never)
        .execute()

      await expect(podRequired.up(db)).rejects.toThrow(/no root group/)
    } finally {
      await app.db.deleteFrom('tickets').execute()
      await podRequired.up(db)
    }
  })
})
