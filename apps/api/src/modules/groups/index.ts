import type { FastifyInstance } from 'fastify'
import { GroupsRepository } from './repository.js'
import { registerGroupRoutes } from './routes.js'
import { GroupsService } from './service.js'

export default async function groupsModule(app: FastifyInstance): Promise<void> {
  const repository = new GroupsRepository(app.db)
  const service = new GroupsService(repository)
  registerGroupRoutes(app, service)
}
