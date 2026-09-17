import { Writable } from 'node:stream'
import { createLoggerOptions } from '@pipo-os/observability/logger'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { ROW_FIELD_PII } from './rows-schema.js'
import { createTicketBodySchema, updateTicketBodySchema } from './schemas.js'

/** Both sides derive from the classification in `rows-schema.ts`. */
const fields = Object.keys(ROW_FIELD_PII) as (keyof typeof ROW_FIELD_PII)[]
const REDACTED = fields.filter((field) => ROW_FIELD_PII[field] === true)
const KEPT = fields.filter((field) => ROW_FIELD_PII[field] !== true)

const SENTINEL = (field: string): string => `sentinel-${field}`

/** Through Fastify, which is the path production logs actually take. */
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
  /** An emptied classification would make every assertion below vacuous. */
  it('has personal data to redact in the first place', () => {
    expect(REDACTED.length).toBeGreaterThan(0)
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

/** `title` carries the subject the EI sends, which ends in the beneficiary
 *  name. Creation writes it and no other route does. */
const validBody = {
  enrollmentId: '00000000-0000-4000-8000-000000000001',
  enrollmentType: 'inclusion',
  companyId: '00000000-0000-4000-8000-000000000002',
  sourceSystem: 'enrollment-integrations',
  enrollmentSnapshot: {},
}

describe('title', () => {
  it('is personal data, because creation writes it', () => {
    expect(Object.keys(createTicketBodySchema.shape)).toContain('title')
    expect(ROW_FIELD_PII.title).toBe(true)
  })

  it('has no correction path: the update schema still refuses it', () => {
    const rejected = updateTicketBodySchema.safeParse({ title: 'Inclusão - MARIA SILVA' })

    expect(rejected.success).toBe(false)
  })
})

/** `tags` is classified as safe because a tag cannot hold a person. That is an
 *  invariant of the write schemas, so it is checked here. */
describe('tags', () => {
  it.each(['produto:health', 'porte:pme-plus', 'risco_carencia', 'pj_mov'])(
    'accepts the classification tag %s',
    (tag) => {
      const parsed = createTicketBodySchema.safeParse({ ...validBody, tags: [tag] })

      expect(parsed.success).toBe(true)
    },
  )

  it.each([
    ['a name', 'NATÁLIA MACHADO ANDRADE'],
    ['a name in a value', 'beneficiario:Maria Silva'],
    ['free text', 'ligar para a Maria amanhã'],
  ])('rejects %s as a tag', (_label, tag) => {
    const created = createTicketBodySchema.safeParse({ ...validBody, tags: [tag] })
    const updated = updateTicketBodySchema.safeParse({ tags: [tag] })

    expect(created.success).toBe(false)
    expect(updated.success).toBe(false)
  })
})
