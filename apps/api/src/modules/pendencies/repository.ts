import type { Kysely } from 'kysely'
import type { Database } from '../../infrastructure/db.js'
import type { PendencyItem } from './schemas.js'

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
