import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { ErrorDetails } from '../../shared/errors.js'
import type { Author } from '../auth/authenticate.js'
import { applyStatusChange, toTicket } from '../tickets/repository.js'
import type { Ticket } from '../tickets/schemas.js'
import { toComment } from './repository.js'
import type { Comment, CreateSubmissionBody } from './schemas.js'

export type SubmitResult =
  | { kind: 'ok'; submissionId: string; ticket: Ticket; comments: Comment[] }
  | { kind: 'not-found' }
  | { kind: 'already-closed' }
  | { kind: 'refused'; failures: ErrorDetails }
  | { kind: 'unknown-reply' }
  | { kind: 'reply-to-reply' }

export async function submit(
  db: Kysely<Database>,
  ticketId: string,
  body: CreateSubmissionBody,
  author: Author,
): Promise<SubmitResult> {
  return db.transaction().execute(async (trx): Promise<SubmitResult> => {
    const current = await trx
      .selectFrom('tickets')
      .selectAll()
      .where('id', '=', ticketId)
      .forUpdate()
      .executeTakeFirst()
    if (!current) return { kind: 'not-found' }

    if (body.inReplyTo) {
      const answered = await trx
        .selectFrom('ticket_comments')
        .select('id')
        .where('ticket_id', '=', ticketId)
        .where('submission_id', '=', body.inReplyTo)
        .union(
          trx
            .selectFrom('ticket_status_history')
            .select('id')
            .where('ticket_id', '=', ticketId)
            .where('submission_id', '=', body.inReplyTo),
        )
        .executeTakeFirst()
      if (!answered) return { kind: 'unknown-reply' }

      const nested = await trx
        .selectFrom('ticket_comments')
        .select('id')
        .where('ticket_id', '=', ticketId)
        .where('submission_id', '=', body.inReplyTo)
        .where('in_reply_to', 'is not', null)
        .executeTakeFirst()
      if (nested) return { kind: 'reply-to-reply' }
    }

    const submissionId = randomUUID()
    let ticket = toTicket(current)

    if (body.status) {
      const changed = await applyStatusChange(trx, {
        ticketId,
        toStatus: body.status.status,
        authorId: author.id,
        reason: body.status.reason,
        completion: body.status.completion,
        submissionId,
      })
      if (changed.kind !== 'ok') return changed
      ticket = changed.ticket
    }

    const rows =
      body.parts.length === 0
        ? []
        : await trx
            .insertInto('ticket_comments')
            .values(
              body.parts.map((part) => ({
                ticket_id: ticketId,
                kind: 'manual' as const,
                channel: 'internal' as const,
                visibility: part.channel === 'platform' ? 'public' : 'private',
                body: part.body,
                author_id: author.id,
                author_type: author.type,
                event_type: null,
                submission_id: submissionId,
                in_reply_to: body.inReplyTo ?? null,
              })),
            )
            .returningAll()
            .execute()

    return { kind: 'ok', submissionId, ticket, comments: rows.map(toComment) }
  })
}
