import type { FastifyInstance } from 'fastify'
import { TicketsRepository } from '../tickets/repository.js'
import { CommentsRepository } from './repository.js'
import { registerCommentRoutes } from './routes.js'
import { CommentsService } from './service.js'

export default async function commentsModule(app: FastifyInstance): Promise<void> {
  const ticketsRepository = new TicketsRepository(app.db)
  const repository = new CommentsRepository(app.db)
  const service = new CommentsService(repository, ticketsRepository)
  registerCommentRoutes(app, service)
}
