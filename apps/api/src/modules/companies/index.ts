import type { FastifyInstance } from 'fastify'
import { registerCompanyRoutes } from './routes.js'

export default async function companiesModule(app: FastifyInstance): Promise<void> {
  registerCompanyRoutes(app)
}
