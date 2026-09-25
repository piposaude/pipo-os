import type { FastifyInstance } from 'fastify'
import { registerPendencyRoutes } from './routes.js'

export default async function pendenciesModule(app: FastifyInstance): Promise<void> {
  registerPendencyRoutes(app)
}
