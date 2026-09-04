import { BadRequestError, NotFoundError } from '../../shared/errors.js'
import type { TicketsRepositoryPort } from '../tickets/repository.js'
import type { CommentsRepositoryPort, TimelineKey } from './repository.js'
import type { Comment, CommentList, CreateCommentBody, Timeline, TimelineQuery } from './schemas.js'

/* The cursor is base64 of "<created_at>|<id>" — opaque so the keyset can
   change without breaking a client that stored one. A malformed cursor is
   the caller's mistake, not a server fault: 400, never a silent page one. */
const CURSOR_SEPARATOR = '|'

function encodeCursor(key: TimelineKey): string {
  return Buffer.from(`${key.createdAt}${CURSOR_SEPARATOR}${key.id}`).toString('base64url')
}

function decodeCursor(cursor: string): TimelineKey {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  const separator = decoded.indexOf(CURSOR_SEPARATOR)
  const createdAt = decoded.slice(0, separator)
  const id = decoded.slice(separator + 1)

  if (separator === -1 || !UUID.test(id) || Number.isNaN(Date.parse(createdAt))) {
    throw new BadRequestError('Malformed timeline cursor')
  }

  return { createdAt, id }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class CommentsService {
  constructor(
    private readonly repository: CommentsRepositoryPort,
    private readonly ticketsRepository: TicketsRepositoryPort,
  ) {}

  async add(ticketId: string, data: CreateCommentBody, authorId: string): Promise<Comment> {
    const ticket = await this.ticketsRepository.findById(ticketId)
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`)
    return this.repository.create(ticketId, data, authorId)
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
