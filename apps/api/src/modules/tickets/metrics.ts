import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { deadline } from '../../shared/deadline.js'
import type { Comment } from '../comments/schemas.js'
import { CLOSED_STATUSES, ticketStatusSchema, type TicketStatus } from './schemas.js'

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

const OPEN_STATUSES = ticketStatusSchema.options.filter((status) => !CLOSED_STATUSES.has(status))

export const OPEN_TICKETS_READ_TIMEOUT_MS = 2_000

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

  new client.Gauge({
    name: 'pipos_tickets_open',
    help: 'Open tickets by status, read from the database at every scrape',
    labelNames: ['status'] as const,
    async collect() {
      const read = deadline(OPEN_TICKETS_READ_TIMEOUT_MS)
      try {
        const rows = await Promise.race([
          app.db
            .selectFrom('tickets')
            .select(['status', (eb) => eb.fn.countAll<string>().as('count')])
            .where('status', 'not in', [...CLOSED_STATUSES])
            .groupBy('status')
            .execute(),
          new Promise<never>((_resolve, reject) => {
            read.signal.addEventListener('abort', () => reject(read.signal.reason))
          }),
        ])
        const counts = new Map(rows.map((row) => [row.status, Number(row.count)]))

        this.reset()
        for (const status of OPEN_STATUSES) this.set({ status }, counts.get(status) ?? 0)
      } catch (err) {
        this.reset()
        app.log.error({ err }, 'failed to read open tickets for pipos_tickets_open')
      } finally {
        read.clear()
      }
    },
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
  { name: 'ticket-metrics', dependencies: ['observability-metrics', 'db'] },
)
