import type { Kysely, Selectable } from 'kysely'
import { z } from 'zod'
import type { Database } from '../../infrastructure/db.js'
import type { TicketComments } from '../../infrastructure/db-types.js'
import type { Comment, CreateCommentBody } from './schemas.js'

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

export interface CommentsRepositoryPort {
  create(ticketId: string, data: CreateCommentBody, authorId: string): Promise<Comment>
  findMany(ticketId: string): Promise<Comment[]>
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
}
