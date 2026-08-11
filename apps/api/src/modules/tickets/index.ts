import type { FastifyInstance } from 'fastify'
import { TicketsRepository } from './repository.js'
import { registerTicketRoutes } from './routes.js'
import { TicketsService } from './service.js'

export default async function ticketsModule(app: FastifyInstance): Promise<void> {
  const repository = new TicketsRepository(app.db)
  const service = new TicketsService(repository)

  registerTicketRoutes(app, service)
}
