import { sql, type Kysely, type Selectable } from 'kysely'
import { z } from 'zod'
import type { Database } from '../../infrastructure/db.js'
import type { TicketComments } from '../../infrastructure/db-types.js'
import type { Comment, CreateCommentBody, TimelineItem } from './schemas.js'

function toComment(row: Selectable<TicketComments>): Comment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    kind: row.kind as Comment['kind'],
    channel: row.channel as Comment['channel'],
    visibility: row.visibility as Comment['visibility'],
    eventType: row.event_type,
    authorId: row.author_id,
    body: row.body,
    metadata: z.record(z.string(), z.unknown()).parse(row.metadata),
    createdAt: row.created_at.toISOString(),
  }
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
    createdAt: row.created_at.toISOString(),
  }

  if (row.source === 'status') {
    return {
      ...base,
      type: 'status-changed',
      fromStatus: row.from_status!,
      toStatus: row.to_status!,
      reason: row.reason,
      authorType: row.author_type!,
    }
  }

  if (row.kind === 'automated_event') {
    return {
      ...base,
      type: 'event',
      eventType: row.event_type,
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

export interface CommentsRepositoryPort {
  create(ticketId: string, data: CreateCommentBody, authorId: string): Promise<Comment>
  findMany(ticketId: string): Promise<Comment[]>
  findTimeline(ticketId: string): Promise<TimelineItem[]>
}

export class CommentsRepository implements CommentsRepositoryPort {
  constructor(private readonly db: Kysely<Database>) {}

  async create(ticketId: string, data: CreateCommentBody, authorId: string): Promise<Comment> {
    const row = await this.db
      .insertInto('ticket_comments')
      .values({
        ticket_id: ticketId,
        kind: 'manual',
        channel: 'internal',
        visibility: data.visibility,
        body: data.body,
        author_id: authorId,
        event_type: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()

    return toComment(row)
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
     to the microsecond, and without it their order flips between calls. */
  async findTimeline(ticketId: string): Promise<TimelineItem[]> {
    const { rows } = await sql<TimelineRow>`
      select 'comment' as source, id, ticket_id, author_id, created_at,
             kind, channel, visibility, event_type, body, metadata,
             null as from_status, null as to_status, null as reason,
             null as author_type
        from ticket_comments
       where ticket_id = ${ticketId}
      union all
      select 'status' as source, id, ticket_id, author_id, created_at,
             null as kind, null as channel, null as visibility,
             null as event_type, null as body, null as metadata,
             from_status, to_status, reason, author_type
        from ticket_status_history
       where ticket_id = ${ticketId}
       order by created_at asc, id asc
    `.execute(this.db)

    return rows.map(toTimelineItem)
  }
}
