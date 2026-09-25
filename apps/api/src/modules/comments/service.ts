import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
  ValidationFailedError,
} from '../../shared/errors.js'
import type { TicketMetrics } from '../tickets/metrics.js'
import type { TicketsRepositoryPort } from '../tickets/repository.js'
import type { Author } from '../auth/authenticate.js'
import type { CommentsRepositoryPort, TimelineKey, WrittenComment } from './repository.js'
import type {
  CommentList,
  CreateCommentBody,
  CreateSubmissionBody,
  Submission,
  Timeline,
  TimelineQuery,
} from './schemas.js'

/* The cursor is base64 of "<created_at>|<id>" — opaque so the keyset can
   change without breaking a client that stored one. A malformed cursor is
   the caller's mistake, not a server fault: 400, never a silent page one. */
const CURSOR_SEPARATOR = '|'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function encodeCursor(key: TimelineKey): string {
  return Buffer.from(`${key.createdAt}${CURSOR_SEPARATOR}${key.id}`).toString('base64url')
}

/* Base64 never throws on garbage — it decodes to nonsense — so the shape has
   to be checked before either half is trusted as a query parameter. */
function decodeCursor(cursor: string): TimelineKey {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  const separator = decoded.indexOf(CURSOR_SEPARATOR)
  if (separator === -1) throw new BadRequestError('Malformed timeline cursor')

  const createdAt = decoded.slice(0, separator)
  const id = decoded.slice(separator + 1)
  if (!UUID.test(id) || Number.isNaN(Date.parse(createdAt))) {
    throw new BadRequestError('Malformed timeline cursor')
  }

  return { createdAt, id }
}

export class CommentsService {
  constructor(
    private readonly repository: CommentsRepositoryPort,
    private readonly ticketsRepository: TicketsRepositoryPort,
    private readonly metrics: TicketMetrics,
  ) {}

  async add(ticketId: string, data: CreateCommentBody, author: Author): Promise<WrittenComment> {
    /* Before the ticket is even looked up: a person writing "Sistema:
       atribuído a mim" is forgery, and the chronology is what the operation
       reads to know what happened. The API records the events it causes
       itself through the repository, not through this route. */
    if (data.kind === 'automated_event' && author.type !== 'service') {
      throw new ForbiddenError('An automated event is written by a service, not by a person')
    }

    const ticket = await this.ticketsRepository.findById(ticketId)
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`)

    /* The index decides, not a read before the write: two redeliveries landing
       together would both find nothing and both insert. */
    return this.repository.create(ticketId, data, author)
  }

  async submit(
    ticketId: string,
    data: CreateSubmissionBody,
    author: Author,
  ): Promise<{ submission: Submission; created: boolean }> {
    const result = await this.repository.submit(ticketId, data, author)

    if (result.kind === 'not-found') throw new NotFoundError(`Ticket ${ticketId} not found`)
    if (result.kind === 'already-closed')
      throw new UnprocessableEntityError(`Ticket ${ticketId} is already closed`)
    if (result.kind === 'refused')
      throw new ValidationFailedError(`Ticket ${ticketId} cannot be completed`, result.failures)
    if (result.kind === 'unknown-reply') {
      const message = `inReplyTo is not a submission of ticket ${ticketId}`
      throw new ValidationFailedError(message, [
        { field: 'inReplyTo', message, code: 'unknown_submission' },
      ])
    }
    if (result.kind === 'reply-to-reply') {
      const message = 'inReplyTo is itself a reply: answer the submission that opened the thread'
      throw new ValidationFailedError(message, [
        { field: 'inReplyTo', message, code: 'not_thread_root' },
      ])
    }

    const { created, submissionId, ticket, comments, statusChange } = result
    if (statusChange) this.metrics.statusChanged(statusChange.fromStatus, statusChange.toStatus)
    return { submission: { submissionId, ticket, comments }, created }
  }

  async list(ticketId: string): Promise<CommentList> {
    const ticket = await this.ticketsRepository.findById(ticketId)
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`)
    const data = await this.repository.findMany(ticketId)
    return { data }
  }

  async timeline(ticketId: string, query: TimelineQuery): Promise<Timeline> {
    const ticket = await this.ticketsRepository.findById(ticketId)
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`)

    const { items, nextKey } = await this.repository.findTimeline(
      ticketId,
      query.cursor ? decodeCursor(query.cursor) : null,
      query.limit,
      query.visibility === 'public',
    )

    return { data: items, ...(nextKey ? { nextCursor: encodeCursor(nextKey) } : {}) }
  }
}
