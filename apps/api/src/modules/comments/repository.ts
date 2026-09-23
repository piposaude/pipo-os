import { sql, type Kysely, type Selectable, type Transaction } from 'kysely'
import { z } from 'zod'
import type { Database } from '../../infrastructure/db.js'
import type { TicketComments } from '../../infrastructure/db-types.js'
import type { Author } from '../auth/authenticate.js'
import type { TicketEventType } from './event-types.js'
import type { Comment, CreateCommentBody, TimelineItem } from './schemas.js'

function toComment(row: Selectable<TicketComments>): Comment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    kind: row.kind as Comment['kind'],
    channel: row.channel as Comment['channel'],
    visibility: row.visibility as Comment['visibility'],
    eventType: row.event_type as Comment['eventType'],
    authorId: row.author_id,
    authorType: row.author_type as Comment['authorType'],
    body: row.body,
    metadata: z.record(z.string(), z.unknown()).parse(row.metadata),
    createdAt: row.created_at.toISOString(),
  }
}

/** The API's own writes go through the caller's transaction when there is one,
 *  so an event and the change that caused it commit or roll back together. */
export type CommentExecutor = Kysely<Database> | Transaction<Database>

/** `created` is false when the write found the event already there — a
 *  redelivery, not a second event. The route answers 200 instead of 201, and
 *  a caller inside a transaction learns it without an error being raised. */
export interface WrittenComment {
  comment: Comment
  created: boolean
}

/** What the API says happened to a ticket it just changed. */
export interface TicketEventInput {
  ticketId: string
  eventType: TicketEventType
  body: string
  /** Private by default: an event nobody decided to show is an internal record
   *  of the operation, and the public cut is what HR reads. */
  visibility?: Comment['visibility']
  metadata?: Record<string, unknown>
  idempotencyKey?: string
}

function eventRow(event: TicketEventInput, author: Author) {
  return {
    ticket_id: event.ticketId,
    kind: 'automated_event' as const,
    channel: 'internal' as const,
    visibility: event.visibility ?? 'private',
    body: event.body,
    author_id: author.id,
    author_type: author.type,
    event_type: event.eventType,
    metadata: JSON.stringify(event.metadata ?? {}),
    idempotency_key: event.idempotencyKey ?? null,
  }
}

/**
 * Writes an automated event on the executor the caller hands over, so the event
 * and the change that caused it commit together — PD-047 writes the assignment
 * inside the transaction of its UPDATE.
 *
 * The redelivery is absorbed by the index and never raised: inside a
 * transaction a 23505 aborts the whole block, so a replay would undo the very
 * change the event explains. `DO NOTHING` returns no row, and that absence is
 * what says the event was already there.
 */
export async function insertEvent(
  executor: CommentExecutor,
  event: TicketEventInput,
  author: Author,
): Promise<WrittenComment> {
  const row = await executor
    .insertInto('ticket_comments')
    .values(eventRow(event, author))
    /* The predicate has to match the partial index, or Postgres finds no
       arbiter for it. A row with no key never conflicts: the partial index
       does not hold it. */
    .onConflict((oc) =>
      oc
        .columns(['ticket_id', 'idempotency_key'])
        .where('idempotency_key', 'is not', null)
        .doNothing(),
    )
    .returningAll()
    .executeTakeFirst()

  if (row) return { comment: toComment(row), created: true }

  const existing = await findByIdempotencyKey(executor, event.ticketId, event.idempotencyKey!)
  /* Only the index above can make the insert return nothing, and it only fires
     on a key that is already there — so the read cannot come back empty
     unless the row was deleted between the two statements. */
  if (!existing) throw new Error('Automated event vanished between insert and read')

  return { comment: existing, created: false }
}

const EVENTS_PER_INSERT = 1000

/** No idempotency key: a batch has no single row to report as replayed. */
export async function insertEvents(
  executor: CommentExecutor,
  events: readonly Omit<TicketEventInput, 'idempotencyKey'>[],
  author: Author,
): Promise<void> {
  for (let start = 0; start < events.length; start += EVENTS_PER_INSERT) {
    await executor
      .insertInto('ticket_comments')
      .values(events.slice(start, start + EVENTS_PER_INSERT).map((e) => eventRow(e, author)))
      .execute()
  }
}

async function findByIdempotencyKey(
  executor: CommentExecutor,
  ticketId: string,
  key: string,
): Promise<Comment | undefined> {
  const row = await executor
    .selectFrom('ticket_comments')
    .selectAll()
    .where('ticket_id', '=', ticketId)
    .where('idempotency_key', '=', key)
    .executeTakeFirst()

  return row && toComment(row)
}

/**
 * One row of the union. The two sources have different columns, so each side
 * selects `null` for what it does not carry; `source` says which side won.
 */
interface TimelineRow {
  source: 'comment' | 'status'
  id: string
  ticket_id: string
  author_id: string | null
  created_at: Date
  /** `created_at` at full Postgres precision — see `findTimeline`. */
  cursor_at: string
  kind: string | null
  channel: string | null
  visibility: string | null
  event_type: string | null
  body: string | null
  metadata: unknown
  from_status: string | null
  to_status: string | null
  reason: string | null
  author_type: string | null
}

function toTimelineItem(row: TimelineRow): TimelineItem {
  const base = {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    // Both tables have the column NOT NULL with the same CHECK; the union's
    // row type cannot say so, the way it cannot for `channel` below.
    authorType: row.author_type as TimelineItem['authorType'],
    createdAt: row.created_at.toISOString(),
  }

  if (row.source === 'status') {
    return {
      ...base,
      type: 'status-changed',
      fromStatus: row.from_status!,
      toStatus: row.to_status!,
      reason: row.reason,
    }
  }

  if (row.kind === 'automated_event') {
    return {
      ...base,
      type: 'event',
      // Null only on a manual comment, and this branch already read `kind`.
      eventType: row.event_type as Extract<TimelineItem, { type: 'event' }>['eventType'],
      body: row.body!,
      metadata: z.record(z.string(), z.unknown()).parse(row.metadata),
    }
  }

  return {
    ...base,
    type: 'comment',
    channel: row.channel as Extract<TimelineItem, { type: 'comment' }>['channel'],
    visibility: row.visibility as Extract<TimelineItem, { type: 'comment' }>['visibility'],
    body: row.body!,
  }
}

/** Where a page stopped: the ordering key of its last row. */
export interface TimelineKey {
  createdAt: string
  id: string
}

export interface TimelinePage {
  items: TimelineItem[]
  nextKey?: TimelineKey
}

export interface CommentsRepositoryPort {
  create(ticketId: string, data: CreateCommentBody, author: Author): Promise<WrittenComment>
  findMany(ticketId: string): Promise<Comment[]>
  findTimeline(
    ticketId: string,
    after: TimelineKey | null,
    limit: number,
    publicOnly?: boolean,
  ): Promise<TimelinePage>
}

export class CommentsRepository implements CommentsRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(ticketId: string, data: CreateCommentBody, author: Author): Promise<WrittenComment> {
    if (data.kind === 'automated_event') {
      return insertEvent(this.db, { ...data, ticketId }, author)
    }

    const row = await this.db
      .insertInto('ticket_comments')
      .values({
        ticket_id: ticketId,
        kind: 'manual',
        // Still the only channel anyone writes. `platform` — the HR side of the
        // composer — comes with the submission, in the second half of PD-040.
        channel: 'internal',
        visibility: data.visibility,
        body: data.body,
        author_id: author.id,
        author_type: author.type,
        event_type: null,
        // No metadata key at all, so the column default stands instead of an
        // empty object written by hand.
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return { comment: toComment(row), created: true }
  }

  async findMany(ticketId: string): Promise<Comment[]> {
    const rows = await this.db
      .selectFrom('ticket_comments')
      .selectAll()
      .where('ticket_id', '=', ticketId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute()

    return rows.map(toComment)
  }

  /* `id` is the tiebreak, not decoration: two rows can share `created_at`
     to the microsecond, and without it their order flips between calls —
     which would also make the keyset below skip or repeat an item.
     `limit + 1` is fetched so the caller can tell a full last page from a
     page that has a successor, without a second round trip.

     The cursor half of `created_at` comes from `to_char`, not from the `Date`
     the driver builds: `timestamptz` keeps microseconds and a JS `Date` only
     holds milliseconds, so a cursor built from `toISOString()` always lands
     BEFORE the row it was meant to skip — and `now()` gives every real row
     microseconds. The page would then repeat its own last row forever. */
  async findTimeline(
    ticketId: string,
    after: TimelineKey | null,
    limit: number,
    publicOnly = false,
  ) {
    const keyset = after
      ? sql`and (t.created_at, t.id) > (${after.createdAt}::timestamptz, ${after.id}::uuid)`
      : sql``

    /* A status change has no visibility column, and its `reason` is free text
       an analyst wrote for the team — so the public cut drops that branch
       whole instead of assuming it is safe to show. Opting it back in is a
       decision for whoever builds the HR-facing view. */
    const publicComments = publicOnly ? sql`and visibility = 'public'` : sql``
    const historyBranch = publicOnly
      ? sql``
      : sql`
        union all
        select 'status' as source, id, ticket_id, author_id, created_at,
               null as kind, null as channel, null as visibility,
               null as event_type, null as body, null as metadata,
               from_status, to_status, reason, author_type
          from ticket_status_history
         where ticket_id = ${ticketId}`

    const { rows } = await sql<TimelineRow>`
      with t as (
        select 'comment' as source, id, ticket_id, author_id, created_at,
               kind, channel, visibility, event_type, body, metadata,
               null as from_status, null as to_status, null as reason,
               author_type
          from ticket_comments
         where ticket_id = ${ticketId} ${publicComments}
        ${historyBranch}
      )
      select t.*,
             to_char(t.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at
        from t
       where true ${keyset}
       order by t.created_at asc, t.id asc
       limit ${limit + 1}
    `.execute(this.db)

    const page = rows.slice(0, limit)
    const last = rows.length > limit ? page[page.length - 1] : undefined

    return {
      items: page.map(toTimelineItem),
      nextKey: last ? { createdAt: last.cursor_at, id: last.id } : undefined,
    }
  }
}
