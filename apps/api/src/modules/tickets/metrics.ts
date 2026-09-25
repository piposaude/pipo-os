import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    ticketMetrics: TicketMetrics
  }
}

export interface TicketMetrics {
  ticketCreated(sourceSystem: string): void
}

function createTicketMetrics(app: FastifyInstance): TicketMetrics {
  const { client } = app.metrics

  const created = new client.Counter({
    name: 'pipos_tickets_created_total',
    help: 'Tickets created, by the system that sent them',
    labelNames: ['source_system'] as const,
  })

  return {
    ticketCreated: (sourceSystem) => created.inc({ source_system: sourceSystem }),
  }
}

export default fp(
  async function ticketMetricsPlugin(app) {
    app.decorate('ticketMetrics', createTicketMetrics(app))
  },
  { name: 'ticket-metrics', dependencies: ['observability-metrics'] },
)
