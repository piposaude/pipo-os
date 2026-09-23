import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { createRootGroup } from '../groups/root.test-helpers.js'

describe('ticket_completion_members', () => {
  let app: FastifyInstance
  let ticketId: string
  let rootGroupId: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    rootGroupId = await createRootGroup(app.db)
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_groups').where('id', '=', rootGroupId).execute()
    await app.close()
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_completion_members').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  const createTicket = async (): Promise<string> => {
    const row = await app.db
      .insertInto('tickets')
      .values({
        enrollment_id: '00000000-0000-4000-8000-000000000001',
        enrollment_type: 'inclusion',
        company_id: '00000000-0000-4000-8000-000000000002',
        source_system: 'enrollment-integrations',
        status: 'carrier-processing',
        group_id: rootGroupId,
        enrollment_snapshot: JSON.stringify({}),
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  const answer = (taxId: string) =>
    app.db
      .insertInto('ticket_completion_members')
      .values({
        ticket_id: ticketId,
        tax_id: taxId,
        id_card_number: '0001234500018',
        start_date: '2026-10-01',
      })
      .execute()

  it('keeps a single answer per life of a ticket', async () => {
    ticketId = await createTicket()
    await answer('12345678900')

    await expect(answer('12345678900')).rejects.toThrow(/ticket_completion_members_pkey/)
  })

  it('refuses a tax id that is not eleven digits', async () => {
    ticketId = await createTicket()

    await expect(answer('123.456.789-00')).rejects.toThrow(/ticket_completion_members_tax_id_check/)
  })
})
