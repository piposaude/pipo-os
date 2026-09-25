import { Sentry } from '@pipo-os/observability/sentry-node'
import type { FastifyBaseLogger } from 'fastify'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import { deadline } from '../../shared/deadline.js'
import { signatureHeaders } from './signature.js'

export const CLAIM_LIMIT = 20
export const LEASE_SECONDS = 60
export const DELIVERY_TIMEOUT_MS = 10_000
export const MAX_ATTEMPTS = 10
const BACKOFF_BASE_SECONDS = 30
const BACKOFF_CAP_SECONDS = 3600

export interface DueDelivery {
  id: string
  ticketId: string
  webhookConfigId: string
  targetUrl: string
  secret: string
  body: string
  attemptCount: number
}

export async function claimDue(db: Kysely<Database>, limit = CLAIM_LIMIT): Promise<DueDelivery[]> {
  const rows = await db
    .updateTable('outbound_webhook_deliveries as d')
    .from('webhook_configs as c')
    .set({ locked_at: sql`now()` })
    .whereRef('c.id', '=', 'd.webhook_config_id')
    .where('d.id', 'in', (eb) =>
      eb
        .selectFrom('outbound_webhook_deliveries')
        .select('id')
        .where('status', 'in', ['pending', 'failed'])
        .where('next_attempt_at', '<=', sql<Date>`now()`)
        .where((w) =>
          w.or([
            w('locked_at', 'is', null),
            w('locked_at', '<', sql<Date>`now() - make_interval(secs => ${LEASE_SECONDS})`),
          ]),
        )
        .orderBy('next_attempt_at')
        .limit(limit)
        .forUpdate()
        .skipLocked(),
    )
    .returning([
      'd.id',
      'd.ticket_id',
      'd.webhook_config_id',
      'd.target_url',
      'd.payload',
      'd.attempt_count',
      'c.secret',
    ])
    .execute()

  return rows.map((row) => ({
    id: row.id,
    ticketId: row.ticket_id,
    webhookConfigId: row.webhook_config_id,
    targetUrl: row.target_url,
    secret: row.secret,
    body: JSON.stringify(row.payload),
    attemptCount: row.attempt_count,
  }))
}

export interface AttemptOptions {
  db: Kysely<Database>
  log: FastifyBaseLogger
  timeoutMs?: number
  now?: () => Date
}

type Outcome = { responseStatus: number; error: null } | { responseStatus: null; error: string }

function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message
}

async function send(delivery: DueDelivery, at: Date, timeoutMs: number): Promise<Outcome> {
  const call = deadline(timeoutMs)
  try {
    const response = await fetch(delivery.targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pipodesk-Delivery': delivery.id,
        ...signatureHeaders(delivery.secret, delivery.body, at),
      },
      body: delivery.body,
      redirect: 'error',
      signal: call.signal,
    })
    await response.body?.cancel()
    return { responseStatus: response.status, error: null }
  } catch (error) {
    return { responseStatus: null, error: reasonOf(error) }
  } finally {
    call.clear()
  }
}

export async function attempt(
  { db, log, timeoutMs = DELIVERY_TIMEOUT_MS, now = () => new Date() }: AttemptOptions,
  delivery: DueDelivery,
): Promise<void> {
  const outcome = await send(delivery, now(), timeoutMs)
  const delivered =
    outcome.responseStatus !== null && outcome.responseStatus >= 200 && outcome.responseStatus < 300
  const attempts = delivery.attemptCount + 1
  const status = delivered ? 'delivered' : attempts >= MAX_ATTEMPTS ? 'dead' : 'failed'

  await db
    .updateTable('outbound_webhook_deliveries')
    .set({
      status,
      attempt_count: sql`attempt_count + 1`,
      response_status: outcome.responseStatus,
      last_error: outcome.error,
      locked_at: null,
      ...(delivered
        ? { delivered_at: sql`now()` }
        : {
            next_attempt_at: sql`now() + make_interval(secs => least(power(2, attempt_count) * ${BACKOFF_BASE_SECONDS}, ${BACKOFF_CAP_SECONDS}))`,
          }),
    })
    .where('id', '=', delivery.id)
    .execute()

  if (delivered) return

  const context = {
    deliveryId: delivery.id,
    ticketId: delivery.ticketId,
    webhookConfigId: delivery.webhookConfigId,
    attempt: attempts,
    responseStatus: outcome.responseStatus,
    error: outcome.error,
  }
  if (status === 'dead') {
    log.error(context, 'webhook delivery dead')
    Sentry.captureMessage('webhook delivery dead', { level: 'error', extra: context })
  } else {
    log.warn(context, 'webhook delivery failed')
  }
}
