import { describe, expect, it } from 'vitest'
import { ticketRowsQuerySchema } from './rows-schema.js'
import { ticketFilterSchema, ticketReadFilterSchema } from './filter-schema.js'

describe('ticketFilterSchema', () => {
  it('accepts an empty filter — a queue with no criteria lists everything', () => {
    expect(ticketFilterSchema.parse({})).toEqual({})
  })

  it('accepts the thirteen list fields of the queue filter panel', () => {
    const filter = {
      statuses: ['broker-processing', 'missing-documents'],
      companyIds: ['00000000-0000-4000-8000-000000000001'],
      carrierIds: ['unimed'],
      companySizes: ['enterprise'],
      products: ['health'],
      types: ['inclusion'],
      contractTypes: ['clt'],
      relationships: ['holder'],
      origins: ['enrollment-integrations'],
      groupIds: ['00000000-0000-4000-8000-000000000002'],
      tags: ['vip'],
      assigneeIds: ['ana@pipo.health'],
      priorities: ['urgent'],
    }

    expect(ticketFilterSchema.parse(filter)).toEqual(filter)
  })

  it('keeps null as a value where the domain has one: unassigned, no priority, no contract', () => {
    const filter = { assigneeIds: [null], priorities: [null], contractTypes: [null] }

    expect(ticketFilterSchema.parse(filter)).toEqual(filter)
  })

  it('accepts @me, the token the server resolves to the caller', () => {
    expect(ticketFilterSchema.parse({ assigneeIds: ['@me', null] })).toEqual({
      assigneeIds: ['@me', null],
    })
  })

  it('accepts the date cuts as date-only, the way the queue compares them', () => {
    const filter = {
      actionDateBefore: '2026-09-03',
      urgentBy: '2026-09-01',
      createdSince: '2026-08-01',
      archived: false,
    }

    expect(ticketFilterSchema.parse(filter)).toEqual(filter)
  })

  it('accepts subjectQuery, the free text the queue searches the subject with', () => {
    expect(ticketFilterSchema.parse({ subjectQuery: 'josé' })).toEqual({ subjectQuery: 'josé' })
  })

  it('rejects an empty subjectQuery — a blank search constrains nothing', () => {
    expect(ticketFilterSchema.safeParse({ subjectQuery: '' }).success).toBe(false)
  })

  it('rejects an unknown field, so a typo does not become a silently ignored filter', () => {
    const result = ticketFilterSchema.safeParse({ status: 'broker-processing' })

    expect(result.success).toBe(false)
  })

  it('rejects a status outside the eight the API stores', () => {
    expect(ticketFilterSchema.safeParse({ statuses: ['open'] }).success).toBe(false)
  })

  it('rejects a priority outside the four levels', () => {
    expect(ticketFilterSchema.safeParse({ priorities: ['critical'] }).success).toBe(false)
  })

  it('rejects a relationship outside the three the snapshot derives', () => {
    expect(ticketFilterSchema.safeParse({ relationships: ['conjuge'] }).success).toBe(false)
  })

  it('rejects an empty list — a saved criterion has to constrain something', () => {
    expect(ticketFilterSchema.safeParse({ statuses: [] }).success).toBe(false)
  })

  it('rejects a scalar where the filter expects a list', () => {
    expect(ticketFilterSchema.safeParse({ tags: 'vip' }).success).toBe(false)
  })

  it('rejects a timestamp in a date-only cut', () => {
    expect(ticketFilterSchema.safeParse({ urgentBy: '2026-09-01T12:00:00.000Z' }).success).toBe(
      false,
    )
  })

  it('rejects a non-uuid company id', () => {
    expect(ticketFilterSchema.safeParse({ companyIds: ['acme'] }).success).toBe(false)
  })
})

/** A third hand-kept copy of the filter contract, and the only one TypeScript
 *  cannot check: `{ window, limit, ...filter }` stays assignable with a field
 *  missing, so a criterion left out here is unreachable over HTTP in silence. */
describe('ticketRowsQuerySchema', () => {
  it('offers every field of the read filter over the query string', () => {
    const OWN_FIELDS = ['window', 'limit']
    const offered = Object.keys(ticketRowsQuerySchema.shape)
      .filter((field) => !OWN_FIELDS.includes(field))
      .sort()

    expect(offered).toEqual(Object.keys(ticketReadFilterSchema.shape).sort())
  })
})
