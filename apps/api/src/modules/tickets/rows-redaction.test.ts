import { Writable } from 'node:stream'
import { createLoggerOptions } from '@pipo-os/observability/logger'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { ticketRowSchema } from './rows-schema.js'

/**
 * The queue projection is the widest personal-data surface the API has: it
 * answers up to 5000 rows at once, each carrying a beneficiary. The README asks
 * for the object as the logger's first argument, so `log.info({ row }, ...)` is
 * the shape someone following the convention will write — this proves it does
 * not leak.
 */

/** Fields whose value may not reach a log line. */
const REDACTED = new Set(['beneficiaryName', 'taxId'])

/**
 * Everything else, listed one by one so a new field in the projection fails
 * this test until someone classifies it.
 *
 * Two entries are a judgement call, written down rather than assumed:
 *  - `assigneeId` is a Pipo e-mail, so it is personal data — but it is also the
 *    staff identifier the audit trail is built on (author_id, created_by), and
 *    a log that cannot say who owns a ticket cannot be used for support.
 *  - `title` is the ticket subject. The web builds its own subject as
 *    `carrier · product · person`, and if the EI ever sends that same shape in
 *    the column it carries a name. It stays here because redacting every
 *    `title` in every log object costs more than it buys, and because whether
 *    the column carries a name is a question for the EI (PD-001 / PD-207).
 */
const KEPT = new Set([
  'id',
  'displayNumber',
  'title',
  'enrollmentId',
  'enrollmentType',
  'status',
  'priority',
  'actionDate',
  'groupId',
  'assigneeId',
  'companyId',
  'companyName',
  'carrierId',
  'carrierName',
  'product',
  'contractType',
  'companySize',
  'relationship',
  'tags',
  'sourceSystem',
  'closedAt',
  'createdAt',
  'updatedAt',
])

const SENTINEL = (field: string): string => `sentinel-${field}`

/** The API never builds a pino itself — it hands the options to Fastify. Going
 *  through Fastify keeps this test on the same path production logs take. */
function captureLogs() {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString())
      callback()
    },
  })
  const app = Fastify({ logger: { ...createLoggerOptions({ nodeEnv: 'test' }), stream } })
  return { log: app.log, lines }
}

describe('ticket row logging', () => {
  const fields = Object.keys(ticketRowSchema.shape)

  it('classifies every field of the projection', () => {
    expect(new Set([...REDACTED, ...KEPT])).toEqual(new Set(fields))
  })

  it('redacts the personal data of a row logged whole', () => {
    const { log, lines } = captureLogs()
    const row = Object.fromEntries(fields.map((field) => [field, SENTINEL(field)]))

    log.info({ row }, 'ticket row')

    const line = lines.at(-1) ?? ''
    const entry: { row: Record<string, string> } = JSON.parse(line)

    for (const field of REDACTED) {
      expect(entry.row[field]).toBe('[REDACTED]')
      expect(line).not.toContain(SENTINEL(field))
    }
    for (const field of KEPT) {
      expect(entry.row[field]).toBe(SENTINEL(field))
    }
  })
})
