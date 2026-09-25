import { Sentry } from '@pipo-os/observability/sentry-node'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import { deadline } from '../../shared/deadline.js'
import { signatureHeaders } from './signature.js'

export const CLAIM_LIMIT = 20
export const LEASE_SECONDS = 60
export const DELIVERY_TIMEOUT_MS = 10_000
export const MAX_ATTEMPTS = 10
export const DISPATCH_INTERVAL_MS = 5_000
const BACKOFF_BASE_SECONDS = 30
const BACKOFF_CAP_SECONDS = 3600

export interface DueDelivery {
  id: string
  lockedAt: Date
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
    .set((eb) => ({
      locked_at: sql`date_trunc('milliseconds', now())`,
      target_url: eb.ref('c.target_url'),
    }))
    .whereRef('c.id', '=', 'd.webhook_config_id')
    .where('d.id', 'in', (eb) =>
      eb
        .selectFrom('outbound_webhook_deliveries')
        .select('id')
        .where('status', 'in', ['pending', 'failed'])
        .where('next_attempt_at', '<=', sql<Date>`now()`)
        .where('webhook_config_id', 'in', (sub) =>
          sub.selectFrom('webhook_configs').select('id').where('active', '=', true),
        )
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
      'd.locked_at',
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
    lockedAt: row.locked_at!,
    ticketId: row.ticket_id,
    webhookConfigId: row.webhook_config_id,
    targetUrl: row.target_url,
    secret: row.secret,
    body: JSON.stringify(row.payload),
    attemptCount: row.attempt_count,
  }))
}

type Log = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>

export interface AttemptOptions {
  db: Kysely<Database>
  log: Log
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
    await response.body?.cancel().catch(() => undefined)
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

  const recorded = await db
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
    .where('locked_at', '=', delivery.lockedAt)
    .executeTakeFirst()

  const context = {
    deliveryId: delivery.id,
    ticketId: delivery.ticketId,
    webhookConfigId: delivery.webhookConfigId,
    attempt: attempts,
    responseStatus: outcome.responseStatus,
    error: outcome.error,
  }
  if (recorded.numUpdatedRows === 0n) {
    log.warn(context, 'webhook delivery lease lost, outcome dropped')
    return
  }
  if (delivered) return
  if (status === 'dead') {
    log.error(context, 'webhook delivery dead')
    Sentry.captureMessage('webhook delivery dead', { level: 'error', extra: context })
  } else {
    log.warn(context, 'webhook delivery failed')
  }
}

async function dispatchDue(options: AttemptOptions): Promise<void> {
  const due = await claimDue(options.db)
  await Promise.all(
    due.map((delivery) =>
      attempt(options, delivery).catch((error: unknown) =>
        options.log.error({ err: error, deliveryId: delivery.id }, 'webhook delivery not recorded'),
      ),
    ),
  )
}

export function startDispatcher(
  app: FastifyInstance,
  { intervalMs = DISPATCH_INTERVAL_MS, log = app.log }: { intervalMs?: number; log?: Log } = {},
): void {
  let timer: NodeJS.Timeout | undefined
  let round: Promise<void> = Promise.resolve()
  let closing = false

  const run = () => {
    round = dispatchDue({ db: app.db, log })
      .catch((error: unknown) => log.error({ err: error }, 'webhook dispatch round failed'))
      .finally(() => {
        if (!closing) timer = setTimeout(run, intervalMs)
      })
  }

  app.addHook('onReady', async () => {
    run()
    log.info({ intervalMs }, 'webhook dispatcher started')
  })
  app.addHook('onClose', async () => {
    closing = true
    clearTimeout(timer)
    await round
  })
}
