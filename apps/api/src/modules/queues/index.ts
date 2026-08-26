import type { FastifyInstance } from 'fastify'
import { TicketsRepository } from '../tickets/repository.js'
import { QueuesRepository } from './repository.js'
import { registerQueueRoutes } from './routes.js'
import { QueuesService } from './service.js'

export default async function queuesModule(app: FastifyInstance): Promise<void> {
  const repository = new QueuesRepository(app.db)
  const ticketsRepository = new TicketsRepository(app.db)
  const service = new QueuesService(repository, ticketsRepository)
  registerQueueRoutes(app, service)
}
