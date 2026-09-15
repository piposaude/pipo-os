import type { FastifyInstance } from 'fastify'
import { ServiceUnavailableError } from '../../shared/errors.js'
import { GroupMembersRepository } from '../groups/repository.js'
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

  registerAuthRoutes(app, service, config, {
    // A broken auth-service costs the session its name, never the session.
    // Narrow on purpose: anything else here is a bug, not an outage.
    nameOf: async (email) => {
      try {
        return (await app.users.byEmail(email))?.name ?? null
      } catch (error) {
        if (!(error instanceof ServiceUnavailableError)) {
          throw error
        }
        app.log.warn(error, 'session name unresolved: the pipo user list is unavailable')
        return null
      }
    },
    members: new GroupMembersRepository(app.db),
  })

  if (config.devLoginEnabled) {
    registerDevLoginRoute(app, config)
  }
}
