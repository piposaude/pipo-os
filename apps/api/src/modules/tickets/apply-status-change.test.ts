import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createRootGroup } from '../groups/root.test-helpers.js'
import { applyStatusChange } from './repository.js'

const SUBMISSION = '00000000-0000-4000-8000-0000000000aa'

describe('applyStatusChange', () => {
  let app: FastifyInstance
  let rootGroupId: string
  let ticketId: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
  })

  beforeEach(async () => {
    const row = await app.db
      .insertInto('tickets')
      .values({
        enrollment_id: '00000000-0000-4000-8000-000000000301',
        enrollment_type: 'inclusion',
        company_id: '00000000-0000-4000-8000-000000000302',
        source_system: 'enrollment-integrations',
        status: 'new',
        group_id: rootGroupId,
        enrollment_snapshot: JSON.stringify({}),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    ticketId = row.id
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  const historyOf = () =>
    app.db
      .selectFrom('ticket_status_history')
      .selectAll()
      .where('ticket_id', '=', ticketId)
      .execute()

  it('records the submission the change came from on the history row', async () => {
    const result = await app.db.transaction().execute((trx) =>
      applyStatusChange(trx, {
        ticketId,
        toStatus: 'carrier-processing',
        authorId: 'dev@piposaude.com.br',
        submissionId: SUBMISSION,
      }),
    )

    expect(result.kind).toBe('ok')
    expect(await historyOf()).toMatchObject([
      { from_status: 'new', to_status: 'carrier-processing', submission_id: SUBMISSION },
    ])
  })

  it('writes on the caller transaction, so a later failure undoes the change', async () => {
    await expect(
      app.db.transaction().execute(async (trx) => {
        await applyStatusChange(trx, {
          ticketId,
          toStatus: 'carrier-processing',
          authorId: 'dev@piposaude.com.br',
        })
        throw new Error('the rest of the submission failed')
      }),
    ).rejects.toThrow('the rest of the submission failed')

    const ticket = await app.db
      .selectFrom('tickets')
      .select('status')
      .where('id', '=', ticketId)
      .executeTakeFirstOrThrow()
    expect(ticket.status).toBe('new')
    expect(await historyOf()).toEqual([])
  })
})
