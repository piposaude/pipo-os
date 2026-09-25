import type { FastifyInstance } from 'fastify'
import { startDispatcher } from './dispatcher.js'

export default async function webhooksModule(app: FastifyInstance): Promise<void> {
  if (process.env.WEBHOOK_DISPATCHER_ENABLED === 'true') startDispatcher(app)
}
