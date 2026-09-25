import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from '../../infrastructure/db.js'
import { openPendenciesOf } from './open-pendencies.js'
import { PENDENCY_ACTIONS, type OpenPendency, type PendencyItem } from './schemas.js'

const pendencyEventMetadataSchema = z.object({
  action: z.enum(PENDENCY_ACTIONS),
  itemIds: z.array(z.string()),
})

export async function findOpenPendencies(
  db: Kysely<Database>,
  ticketId: string,
): Promise<OpenPendency[]> {
  const rows = await db
    .selectFrom('ticket_comments')
    .select(['metadata', 'created_at'])
    .where('ticket_id', '=', ticketId)
    .where('event_type', '=', 'pendency_changed')
    .orderBy('created_at')
    .orderBy('id')
    .execute()

  return openPendenciesOf(
    rows.map((row) => ({
      ...pendencyEventMetadataSchema.parse(row.metadata),
      at: row.created_at.toISOString(),
    })),
  )
}

export async function listPendencyItems(
  db: Kysely<Database>,
  enrollmentType: string | undefined,
): Promise<PendencyItem[]> {
  const rows = await db
    .selectFrom('pendency_items')
    .select(['id', 'label', 'category', 'enrollment_type'])
    .where('active', '=', true)
    .$if(enrollmentType !== undefined, (qb) =>
      qb.where((eb) =>
        eb.or([eb('enrollment_type', 'is', null), eb('enrollment_type', '=', enrollmentType!)]),
      ),
    )
    .orderBy('position')
    .orderBy('id')
    .execute()

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    category: row.category as PendencyItem['category'],
    enrollmentType: row.enrollment_type as PendencyItem['enrollmentType'],
  }))
}
