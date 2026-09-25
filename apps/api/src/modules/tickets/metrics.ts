import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import type { Comment } from '../comments/schemas.js'
import type { TicketStatus } from './schemas.js'

declare module 'fastify' {
  interface FastifyInstance {
    ticketMetrics: TicketMetrics
  }
}

export interface TicketMetrics {
  ticketCreated(sourceSystem: string): void
  statusChanged(fromStatus: TicketStatus, toStatus: TicketStatus): void
  commentsCreated(comments: readonly Comment[]): void
}

function createTicketMetrics(app: FastifyInstance): TicketMetrics {
  const { client } = app.metrics

  const created = new client.Counter({
    name: 'pipos_tickets_created_total',
    help: 'Tickets created, by the system that sent them',
    labelNames: ['source_system'] as const,
  })

  const statusChanges = new client.Counter({
    name: 'pipos_tickets_status_changes_total',
    help: 'Ticket status changes, one per status history row',
    labelNames: ['from_status', 'to_status'] as const,
  })

  const comments = new client.Counter({
    name: 'pipos_tickets_comments_created_total',
    help: 'Manual comments written on tickets, by visibility and author type',
    labelNames: ['visibility', 'author_type'] as const,
  })

  return {
    ticketCreated: (sourceSystem) => created.inc({ source_system: sourceSystem }),
    statusChanged: (fromStatus, toStatus) =>
      statusChanges.inc({ from_status: fromStatus, to_status: toStatus }),
    commentsCreated: (written) => {
      for (const comment of written) {
        if (comment.kind !== 'manual') continue
        comments.inc({ visibility: comment.visibility, author_type: comment.authorType })
      }
    },
  }
}

export default fp(
  async function ticketMetricsPlugin(app) {
    app.decorate('ticketMetrics', createTicketMetrics(app))
  },
  { name: 'ticket-metrics', dependencies: ['observability-metrics'] },
)
