import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors.js'
import type { TicketsRepositoryPort } from '../tickets/repository.js'
import type { Author } from '../auth/authenticate.js'
import {
  isIdempotencyCollision,
  type CommentsRepositoryPort,
  type TimelineKey,
} from './repository.js'
import type { Comment, CommentList, CreateCommentBody, Timeline, TimelineQuery } from './schemas.js'

/** `created` is false when the write found the event already there: the route
 *  answers 200 instead of 201, so a redelivery is never mistaken for a second
 *  event by whoever is counting. */
export interface AddedComment {
  comment: Comment
  created: boolean
}

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
  ) {}

  async add(ticketId: string, data: CreateCommentBody, author: Author): Promise<AddedComment> {
    /* Before the ticket is even looked up: a person writing "Sistema:
       atribuído a mim" is forgery, and the chronology is what the operation
       reads to know what happened. The API records the events it causes
       itself through the repository, not through this route. */
    if (data.kind === 'automated_event' && author.type !== 'service') {
      throw new ForbiddenError('An automated event is written by a service, not by a person')
    }

    const ticket = await this.ticketsRepository.findById(ticketId)
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`)

    const key = data.kind === 'automated_event' ? data.idempotencyKey : undefined

    try {
      return { comment: await this.repository.create(ticketId, data, author), created: true }
    } catch (err) {
      /* The index is what decides, not a read before the write: two
         redeliveries landing together would both find nothing and both
         insert. Losing the race is the answer, so the loser reads the row the
         winner wrote. */
      if (!key || !isIdempotencyCollision(err)) throw err

      const existing = await this.repository.findByIdempotencyKey(ticketId, key)
      if (!existing) throw err

      return { comment: existing, created: false }
    }
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
