import type { Kysely, Transaction } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { ErrorDetail, ErrorDetails } from '../../shared/errors.js'
import type { Author } from '../auth/authenticate.js'
import { applyStatusChange, toTicket } from '../tickets/repository.js'
import type { Ticket, TicketStatus } from '../tickets/schemas.js'
import { insertEvents, toComment } from './repository.js'
import { PENDENCY_ACTIONS, type PendencyAction } from '../pendencies/schemas.js'
import type { Comment, CreateSubmissionBody } from './schemas.js'

export type SubmitResult =
  | {
      kind: 'ok'
      created: boolean
      submissionId: string
      ticket: Ticket
      comments: Comment[]
      statusChange: { fromStatus: TicketStatus; toStatus: TicketStatus } | null
    }
  | { kind: 'not-found' }
  | { kind: 'already-closed' }
  | { kind: 'refused'; failures: ErrorDetails }
  | { kind: 'unknown-reply' }
  | { kind: 'reply-to-reply' }
  | { kind: 'invalid-pendencies'; failures: ErrorDetails }

type SubmissionPendencies = NonNullable<CreateSubmissionBody['pendencies']>

const PENDENCY_EVENT_BODY: Record<PendencyAction, { one: string; many: string }> = {
  opened: { one: 'Pendência marcada', many: 'Pendências marcadas' },
  reopened: { one: 'Pendência reaberta', many: 'Pendências reabertas' },
  resolved: { one: 'Pendência resolvida', many: 'Pendências resolvidas' },
}

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

    const { submissionId } = body
    const replayed = await findSubmission(trx, ticketId, submissionId)
    if (replayed) {
      return {
        kind: 'ok',
        created: false,
        submissionId,
        ticket: toTicket(current),
        comments: replayed,
        statusChange: null,
      }
    }

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

    if (body.pendencies) {
      const failures = await pendencyFailures(trx, body.pendencies)
      if (failures) return { kind: 'invalid-pendencies', failures }
    }

    let ticket = toTicket(current)
    let statusChange: { fromStatus: TicketStatus; toStatus: TicketStatus } | null = null

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
      statusChange = { fromStatus: changed.fromStatus, toStatus: changed.ticket.status }
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

    const { pendencies } = body
    if (pendencies) {
      await insertEvents(
        trx,
        PENDENCY_ACTIONS.filter((action) => pendencies[action].length > 0).map((action) => {
          const itemIds = pendencies[action]
          const copy = PENDENCY_EVENT_BODY[action]
          return {
            ticketId,
            eventType: 'pendency_changed' as const,
            body: itemIds.length > 1 ? copy.many : copy.one,
            metadata: { action, itemIds },
          }
        }),
        author,
      )
    }

    return {
      kind: 'ok',
      created: true,
      submissionId,
      ticket,
      comments: rows.map(toComment),
      statusChange,
    }
  })
}

async function pendencyFailures(
  trx: Transaction<Database>,
  pendencies: SubmissionPendencies,
): Promise<ErrorDetails | undefined> {
  const ids = PENDENCY_ACTIONS.flatMap((action) => pendencies[action])
  if (ids.length === 0) return undefined

  const rows = await trx
    .selectFrom('pendency_items')
    .select(['id', 'active'])
    .where('id', 'in', ids)
    .execute()
  const activeById = new Map(rows.map((row) => [row.id, row.active]))

  const failures: ErrorDetail[] = []
  for (const action of PENDENCY_ACTIONS) {
    pendencies[action].forEach((itemId, index) => {
      const field = `pendencies.${action}[${index}]`
      const active = activeById.get(itemId)
      if (active === undefined) {
        failures.push({
          field,
          message: `${itemId} is not a pendency item`,
          code: 'unknown_pendency_item',
        })
      } else if (!active && action !== 'resolved') {
        failures.push({
          field,
          message: `${itemId} is retired: it can be resolved, not charged again`,
          code: 'inactive_pendency_item',
        })
      }
    })
  }

  const [first, ...rest] = failures
  return first ? [first, ...rest] : undefined
}

async function findSubmission(
  trx: Transaction<Database>,
  ticketId: string,
  submissionId: string,
): Promise<Comment[] | undefined> {
  const comments = await trx
    .selectFrom('ticket_comments')
    .selectAll()
    .where('ticket_id', '=', ticketId)
    .where('submission_id', '=', submissionId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  if (comments.length > 0) return comments.map(toComment)

  const history = await trx
    .selectFrom('ticket_status_history')
    .select('id')
    .where('ticket_id', '=', ticketId)
    .where('submission_id', '=', submissionId)
    .executeTakeFirst()
  return history ? [] : undefined
}
