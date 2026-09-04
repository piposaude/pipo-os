import { NotFoundError } from '../../shared/errors.js'
import type { TicketsRepositoryPort } from '../tickets/repository.js'
import type { CommentsRepositoryPort } from './repository.js'
import type { Comment, CommentList, CreateCommentBody, Timeline } from './schemas.js'

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

  async timeline(ticketId: string): Promise<Timeline> {
    const ticket = await this.ticketsRepository.findById(ticketId)
    if (!ticket) throw new NotFoundError(`Ticket ${ticketId} not found`)
    const data = await this.repository.findTimeline(ticketId)
    return { data }
  }
}
