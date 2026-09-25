import { sql, type Kysely } from 'kysely'
import type { Database } from '../../infrastructure/db.js'

export const CLAIM_LIMIT = 20
export const LEASE_SECONDS = 60

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
