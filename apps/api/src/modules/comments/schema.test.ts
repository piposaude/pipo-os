import type { FastifyInstance } from 'fastify'
import { sql, type Insertable } from 'kysely'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import type { TicketComments } from '../../infrastructure/db-types.js'
import {
  UNIQUE_VIOLATION,
  NOT_NULL_VIOLATION,
  CHECK_VIOLATION,
  codeOf,
} from '../../shared/pg.test-helpers.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

const AUTHOR = 'dev@piposaude.com.br'
const SUBMISSION = '00000000-0000-4000-8000-0000000000aa'
const SOME_KEY = 'ei:enrollment-1:hr_platform_reply'

const ticketBody = (enrollmentId: string) => ({
  enrollmentId,
  enrollmentType: 'inclusion',
  companyId: '00000000-0000-4000-8000-000000000002',
  sourceSystem: 'enrollment-integrations',
  enrollmentSnapshot: { name: 'Test User' },
})

describe('comments schema — submission and author columns', () => {
  let app: FastifyInstance
  let sessionCookie: string
  let ticketId: string
  let otherTicketId: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
    })
    sessionCookie = login.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value
  })

  afterAll(async () => {
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  const createTicket = async (enrollmentId: string): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      payload: ticketBody(enrollmentId),
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })
    return response.json().id
  }

  beforeEach(async () => {
    ticketId = await createTicket('00000000-0000-4000-8000-000000000001')
    otherTicketId = await createTicket('00000000-0000-4000-8000-000000000003')
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  const base = (ticket: string) => ({
    ticket_id: ticket,
    kind: 'manual',
    channel: 'internal',
    visibility: 'private',
    body: 'texto',
    author_id: AUTHOR,
    event_type: null,
  })

  const comment = (
    values: Partial<Insertable<TicketComments>> = {},
    ticket = ticketId,
  ): Promise<unknown> =>
    app.db
      .insertInto('ticket_comments')
      .values({ ...base(ticket), author_type: 'user', ...values })
      .execute()

  describe('author_type', () => {
    it('refuses a value outside user, service and system', async () => {
      expect(await codeOf(comment({ author_type: 'robot' }))).toBe(CHECK_VIOLATION)
    })

    it('refuses a row that does not say what kind of author wrote it', async () => {
      const code = await codeOf(
        sql`insert into ticket_comments (ticket_id, kind, channel, visibility, body, author_id)
            values (${ticketId}::uuid, 'manual', 'internal', 'private', 'texto', ${AUTHOR})`.execute(
          app.db,
        ),
      )
      expect(code).toBe(NOT_NULL_VIOLATION)
    })

    it('accepts a system row without an author id', async () => {
      await expect(comment({ author_type: 'system', author_id: null })).resolves.toBeTruthy()
    })

    it('refuses a person or a service without an author id', async () => {
      expect(await codeOf(comment({ author_type: 'user', author_id: null }))).toBe(CHECK_VIOLATION)
      expect(await codeOf(comment({ author_type: 'service', author_id: null }))).toBe(
        CHECK_VIOLATION,
      )
    })

    it('closes the same set on ticket_status_history', async () => {
      const code = await codeOf(
        app.db
          .insertInto('ticket_status_history')
          .values({
            ticket_id: ticketId,
            from_status: 'broker-processing',
            to_status: 'carrier-processing',
            author_type: 'robot',
            author_id: AUTHOR,
          })
          .execute(),
      )
      expect(code).toBe(CHECK_VIOLATION)
    })

    it('accepts a system status change without an author id', async () => {
      await expect(
        app.db
          .insertInto('ticket_status_history')
          .values({
            ticket_id: ticketId,
            from_status: 'broker-processing',
            to_status: 'carrier-processing',
            author_type: 'system',
            author_id: null,
          })
          .execute(),
      ).resolves.toBeTruthy()
    })

    it('closes the same author id rule on ticket_status_history', async () => {
      const code = await codeOf(
        app.db
          .insertInto('ticket_status_history')
          .values({
            ticket_id: ticketId,
            from_status: 'broker-processing',
            to_status: 'carrier-processing',
            author_type: 'user',
            author_id: null,
          })
          .execute(),
      )
      expect(code).toBe(CHECK_VIOLATION)
    })
  })

  describe('idempotency_key', () => {
    it('refuses the same key twice in the same ticket', async () => {
      await comment({ idempotency_key: SOME_KEY })
      expect(await codeOf(comment({ idempotency_key: SOME_KEY }))).toBe(UNIQUE_VIOLATION)
    })

    it('accepts the same key in two different tickets', async () => {
      await comment({ idempotency_key: SOME_KEY })
      await expect(comment({ idempotency_key: SOME_KEY }, otherTicketId)).resolves.toBeTruthy()
    })

    it('accepts any number of rows without a key in the same ticket', async () => {
      await comment()
      await expect(comment()).resolves.toBeTruthy()
    })
  })

  describe('submission', () => {
    it('keeps the same submission id on a comment and on the status change it caused', async () => {
      await comment({ submission_id: SUBMISSION })
      await app.db
        .insertInto('ticket_status_history')
        .values({
          ticket_id: ticketId,
          from_status: 'broker-processing',
          to_status: 'carrier-processing',
          author_type: 'user',
          author_id: AUTHOR,
          submission_id: SUBMISSION,
        })
        .execute()

      const comments = await app.db
        .selectFrom('ticket_comments')
        .select('id')
        .where('submission_id', '=', SUBMISSION)
        .execute()
      const changes = await app.db
        .selectFrom('ticket_status_history')
        .select('id')
        .where('submission_id', '=', SUBMISSION)
        .execute()

      expect(comments).toHaveLength(1)
      expect(changes).toHaveLength(1)
    })

    it('accepts an in_reply_to that matches no row, because it points to a submission', async () => {
      await expect(
        comment({ in_reply_to: '00000000-0000-4000-8000-0000000000bb' }),
      ).resolves.toBeTruthy()
    })
  })
})
