import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { ticketStatusSchema } from './schemas.js'

const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'

async function codeOf(write: Promise<unknown>): Promise<string | undefined> {
  try {
    await write
    return undefined
  } catch (err) {
    if (err instanceof Error && 'code' in err) return err.code as string
    // No Postgres code means the test itself is broken, not a constraint firing.
    throw err
  }
}

let enrollments = 0

/** A fresh enrollment per row: the partial unique index allows one open ticket
 *  per enrollment, and this suite writes many. */
function nextEnrollmentId(): string {
  enrollments += 1
  return `00000000-0000-4000-8000-${String(enrollments).padStart(12, '0')}`
}

describe('tickets schema — status constraint', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(async () => {
    await app.db.deleteFrom('tickets').execute()
  })

  const ticket = (status: string, enrollmentId = nextEnrollmentId()): Promise<unknown> =>
    app.db
      .insertInto('tickets')
      .values({
        enrollment_id: enrollmentId,
        enrollment_type: 'inclusion',
        company_id: '00000000-0000-4000-8000-0000000000aa',
        source_system: 'enrollment-integrations',
        status,
      })
      .execute()

  it('refuses a status outside the vocabulary, without going through Zod', async () => {
    expect(await codeOf(ticket('foo'))).toBe(CHECK_VIOLATION)
  })

  // The partial unique index reads `status NOT IN ('completed', 'cancelled')`
  // literally: a typo lands outside the index and the enrollment silently loses
  // its protection against a duplicate ticket. That is what the CHECK guards.
  it('refuses a near miss of a closing status, which would leave the anti-duplication index', async () => {
    expect(await codeOf(ticket('complete'))).toBe(CHECK_VIOLATION)
  })

  it.each(ticketStatusSchema.options)('accepts %s', async (status) => {
    expect(await codeOf(ticket(status))).toBeUndefined()
  })

  it('still refuses a second open ticket for the same enrollment', async () => {
    const enrollmentId = nextEnrollmentId()
    await ticket('broker-processing', enrollmentId)

    expect(await codeOf(ticket('carrier-processing', enrollmentId))).toBe(UNIQUE_VIOLATION)
  })
})
