import type { FastifyInstance } from 'fastify'
import { registerUserRoutes } from './routes.js'

export default async function usersModule(app: FastifyInstance): Promise<void> {
  registerUserRoutes(app, app.users)
}
