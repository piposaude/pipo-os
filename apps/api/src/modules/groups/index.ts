import type { FastifyInstance } from 'fastify'
import { GroupMembersRepository, GroupsRepository } from './repository.js'
import { registerGroupRoutes } from './routes.js'
import { GroupsService } from './service.js'

export default async function groupsModule(app: FastifyInstance): Promise<void> {
  const repository = new GroupsRepository(app.db)
  const membersRepository = new GroupMembersRepository(app.db)
  const service = new GroupsService(repository, membersRepository)
  registerGroupRoutes(app, service)
}
