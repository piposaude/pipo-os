import type { FastifyInstance } from 'fastify'
import { authConfig } from './config.js'
import { registerDevLoginRoute } from './dev-login.js'
import { registerAuthRoutes } from './routes.js'
import { AuthService } from './service.js'

export default async function authModule(app: FastifyInstance): Promise<void> {
  // authConfig() throws at boot if DEV_LOGIN_ENABLED is set in a deployed
  // environment, so a misconfiguration fails the app instead of exposing the
  // bypass route.
  const config = authConfig()
  const service = new AuthService(config)

  registerAuthRoutes(app, service, config)

  if (config.devLoginEnabled) {
    registerDevLoginRoute(app, config)
  }
}
