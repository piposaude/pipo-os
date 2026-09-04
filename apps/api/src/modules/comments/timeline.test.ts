import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

function cookieValue(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string | null {
  return response.cookies.find((cookie) => cookie.name === name)?.value ?? null
}

const DEV_LOGIN_USER_ID = 'dev@piposaude.com.br'
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000099'

const validTicketBody = {
  enrollmentId: '00000000-0000-4000-8000-000000000001',
  enrollmentType: 'inclusion',
  companyId: '00000000-0000-4000-8000-000000000002',
  sourceSystem: 'enrollment-integrations',
  enrollmentSnapshot: { name: 'Test User' },
}

describe('GET /api/tickets/:id/timeline', () => {
  let app: FastifyInstance
  let sessionCookie: string
  let ticketId: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/ticket/*'] },
    })
    sessionCookie = cookieValue(loginResponse, SESSION_COOKIE_NAME)!
  })

  afterAll(async () => {
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('tickets').execute()
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  /* A ticket per test: the status history is keyed by ticket, and a leftover
     row from a previous case would land in the middle of the chronology. */
  beforeEach(async () => {
    const ticketResponse = await app.inject({
      method: 'POST',
      url: '/api/tickets',
      payload: validTicketBody,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })
    ticketId = ticketResponse.json().id
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_status_history').execute()
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('tickets').execute()
  })

  const addComment = (body: string, visibility: 'public' | 'private' = 'public') =>
    app.inject({
      method: 'POST',
      url: `/api/tickets/${ticketId}/comments`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: { visibility, body },
    })

  const changeStatus = (status: string, reason?: string) =>
    app.inject({
      method: 'PATCH',
      url: `/api/tickets/${ticketId}/status`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      payload: reason ? { status, reason } : { status },
    })

  const getTimeline = (query = '') =>
    app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/timeline${query}`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })

  it('merges comments and status changes into one chronology', async () => {
    await addComment('primeiro')
    await changeStatus('carrier-processing', 'enviado para a operadora')
    await addComment('terceiro')

    const response = await getTimeline()

    expect(response.statusCode).toBe(200)
    const { data } = response.json()
    expect(data.map((item: { type: string }) => item.type)).toEqual([
      'comment',
      'status-changed',
      'comment',
    ])
  })

  it('carries every field of a comment item', async () => {
    await addComment('o corpo do comentário')

    const [item] = (await getTimeline()).json().data

    expect(item).toMatchObject({
      type: 'comment',
      ticketId,
      body: 'o corpo do comentário',
      visibility: 'public',
      channel: 'internal',
      authorId: DEV_LOGIN_USER_ID,
    })
    expect(item.id).toEqual(expect.any(String))
    expect(item.createdAt).toEqual(expect.any(String))
  })

  it('carries every field of a status-changed item', async () => {
    await changeStatus('carrier-processing', 'enviado para a operadora')

    const [item] = (await getTimeline()).json().data

    expect(item).toMatchObject({
      type: 'status-changed',
      ticketId,
      fromStatus: 'broker-processing',
      toStatus: 'carrier-processing',
      reason: 'enviado para a operadora',
      authorId: DEV_LOGIN_USER_ID,
      authorType: 'user',
    })
    expect(item.id).toEqual(expect.any(String))
    expect(item.createdAt).toEqual(expect.any(String))
  })

  /* Nothing writes `automated_event` yet — ACE-58 will. The row is seeded
     directly so the timeline is proven to render it before that lands. */
  it('carries every field of an automated event item', async () => {
    await app.db
      .insertInto('ticket_comments')
      .values({
        ticket_id: ticketId,
        kind: 'automated_event',
        channel: 'internal',
        visibility: 'public',
        event_type: 'priority_changed',
        author_id: DEV_LOGIN_USER_ID,
        body: 'Prioridade alterada para urgente',
        metadata: { priority: 'urgent', previous: null },
      })
      .execute()

    const [item] = (await getTimeline()).json().data

    expect(item).toMatchObject({
      type: 'event',
      ticketId,
      eventType: 'priority_changed',
      body: 'Prioridade alterada para urgente',
      authorId: DEV_LOGIN_USER_ID,
      metadata: { priority: 'urgent', previous: null },
    })
  })

  it('returns an empty list for a ticket with no activity', async () => {
    const response = await getTimeline()

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual([])
  })

  /* Seeded directly so `created_at` is controlled: the whole point of a
     keyset cursor is the order, and rows created through the API would all
     land in the same millisecond. */
  const seedComment = (body: string, createdAt: string) =>
    app.db
      .insertInto('ticket_comments')
      .values({
        ticket_id: ticketId,
        kind: 'manual',
        channel: 'internal',
        visibility: 'public',
        event_type: null,
        author_id: DEV_LOGIN_USER_ID,
        body,
        created_at: new Date(createdAt),
      })
      .execute()

  describe('cursor pagination', () => {
    it('caps the page at limit and hands back a cursor', async () => {
      await seedComment('um', '2026-09-01T10:00:00.000Z')
      await seedComment('dois', '2026-09-01T11:00:00.000Z')
      await seedComment('três', '2026-09-01T12:00:00.000Z')

      const { data, nextCursor } = (await getTimeline('?limit=2')).json()

      expect(data.map((i: { body: string }) => i.body)).toEqual(['um', 'dois'])
      expect(nextCursor).toEqual(expect.any(String))
    })

    it('walks the whole chronology without repeating or skipping an item', async () => {
      await seedComment('um', '2026-09-01T10:00:00.000Z')
      await seedComment('dois', '2026-09-01T11:00:00.000Z')
      await seedComment('três', '2026-09-01T12:00:00.000Z')
      await seedComment('quatro', '2026-09-01T13:00:00.000Z')
      await seedComment('cinco', '2026-09-01T14:00:00.000Z')

      const seen: string[] = []
      let cursor: string | null = null
      let pages = 0
      for (let page = 0; page < 10; page++) {
        const query: string = cursor ? `?limit=2&cursor=${encodeURIComponent(cursor)}` : '?limit=2'
        const body = (await getTimeline(query)).json()
        pages++
        seen.push(...body.data.map((i: { body: string }) => i.body))
        cursor = body.nextCursor ?? null
        if (!cursor) break
      }

      expect(seen).toEqual(['um', 'dois', 'três', 'quatro', 'cinco'])
      /* Five items at two per page: proves the walk really paged, instead of
         passing because everything came back at once. */
      expect(pages).toBe(3)
    })

    it('omits the cursor on the last page', async () => {
      await seedComment('um', '2026-09-01T10:00:00.000Z')
      await seedComment('dois', '2026-09-01T11:00:00.000Z')

      const body = (await getTimeline('?limit=2')).json()

      expect(body.data).toHaveLength(2)
      expect(body.nextCursor ?? null).toBeNull()
    })

    /* The reason this is a keyset and not an offset: a row landing before the
       cursor would shift an OFFSET window and show `dois` twice. */
    it('does not shift the window when an older item is inserted mid-walk', async () => {
      await seedComment('um', '2026-09-01T10:00:00.000Z')
      await seedComment('dois', '2026-09-01T11:00:00.000Z')
      await seedComment('três', '2026-09-01T12:00:00.000Z')

      const first = (await getTimeline('?limit=2')).json()
      expect(first.data.map((i: { body: string }) => i.body)).toEqual(['um', 'dois'])

      await seedComment('intruso', '2026-09-01T09:00:00.000Z')

      const second = (
        await getTimeline(`?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)
      ).json()

      expect(second.data.map((i: { body: string }) => i.body)).toEqual(['três'])
    })

    it('rejects a malformed cursor with 400', async () => {
      const response = await getTimeline('?cursor=not-a-cursor')

      expect(response.statusCode).toBe(400)
    })
  })

  it('returns 401 without session cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/${ticketId}/timeline`,
    })

    expect(response.statusCode).toBe(401)
  })

  it('returns 404 for a nonexistent ticket', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/${NONEXISTENT_ID}/timeline`,
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error).toBe('NotFoundError')
  })
})
