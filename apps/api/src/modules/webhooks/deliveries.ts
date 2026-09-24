import { randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import { STATUS_CHANGED_EVENT, statusChangedPayload, type StatusChange } from './payload.js'

export async function enqueueStatusChange(
  db: Kysely<Database>,
  historyId: string,
  change: StatusChange,
): Promise<void> {
  const destinations = await db
    .selectFrom('webhook_configs')
    .select(['id', 'target_url'])
    .where('active', '=', true)
    .where(sql<boolean>`event_types @> ${JSON.stringify([STATUS_CHANGED_EVENT])}::jsonb`)
    .execute()
  if (destinations.length === 0) return

  await db
    .insertInto('outbound_webhook_deliveries')
    .values(
      destinations.map((destination) => {
        const id = randomUUID()
        return {
          id,
          ticket_id: change.ticket.id,
          status_history_id: historyId,
          webhook_config_id: destination.id,
          target_url: destination.target_url,
          payload: JSON.stringify(statusChangedPayload(id, change)),
        }
      }),
    )
    .onConflict((oc) => oc.columns(['status_history_id', 'webhook_config_id']).doNothing())
    .execute()
}
