import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sql, type Insertable } from 'kysely'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import type { TicketQueues } from '../../infrastructure/db-types.js'

const ANA = 'ana@pipo.health'
const BRUNO = 'bruno@pipo.health'

/** The three closed sets the saved view carries live in contract/ and each
 *  side is held to its half — the other is queue-view-contract.test.ts. */
const VIEW_PATH = fileURLToPath(
  new URL('../../../../../contract/ticket-queue-view.json', import.meta.url),
)

const { sortFields, sortDirections, groupBy, defaultSort } = JSON.parse(
  readFileSync(VIEW_PATH, 'utf-8'),
) as {
  sortFields: string[]
  sortDirections: string[]
  groupBy: string[]
  defaultSort: { by: string; direction: string }
}

const UNIQUE_VIOLATION = '23505'
const FK_VIOLATION = '23503'
const CHECK_VIOLATION = '23514'

async function codeOf(write: Promise<unknown>): Promise<string | undefined> {
  try {
    await write
    return undefined
  } catch (err) {
    if (err instanceof Error && 'code' in err) return err.code as string
    // No Postgres code means the test itself is broken, not a constraint firing.
    throw err
  }
}

describe('queues schema — saved view constraints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(async () => {
    await app.db.deleteFrom('ticket_queues').execute()
    await app.db.deleteFrom('ticket_groups').execute()
  })

  const group = async (name: string): Promise<string> => {
    const row = await app.db
      .insertInto('ticket_groups')
      .values({ name, created_by: 'test' })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  const queue = async (
    name: string,
    extra: Partial<Insertable<TicketQueues>> = {},
  ): Promise<string> => {
    const row = await app.db
      .insertInto('ticket_queues')
      .values({ name, created_by: 'test', ...extra })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  const favorite = (queueId: string, userId: string): Promise<unknown> =>
    app.db
      .insertInto('ticket_queue_favorites')
      .values({ queue_id: queueId, user_id: userId })
      .execute()

  describe('how the view opens', () => {
    it('opens a new view the way the contract says', async () => {
      await queue('Exclusões vencidas')

      const row = await app.db
        .selectFrom('ticket_queues')
        .select(['sort_by', 'sort_direction'])
        .executeTakeFirstOrThrow()

      expect(row).toEqual({ sort_by: defaultSort.by, sort_direction: defaultSort.direction })
    })

    it.each(sortFields)('accepts %s as a sort field', async (sortBy) => {
      await expect(queue('Exclusões vencidas', { sort_by: sortBy })).resolves.toBeTruthy()
    })

    it.each(sortDirections)('accepts %s as a sort direction', async (direction) => {
      await expect(queue('Exclusões vencidas', { sort_direction: direction })).resolves.toBeTruthy()
    })

    it.each(groupBy)('accepts %s as a grouping', async (grouping) => {
      await expect(queue('Exclusões vencidas', { group_by: grouping })).resolves.toBeTruthy()
    })

    /** Read back from the constraint, so a CHECK widened past the contract is
     *  caught here instead of as an option nobody can render. */
    const valuesOfCheck = async (constraint: string): Promise<string[]> => {
      const row = await sql<{ def: string }>`
        SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = ${constraint} AND conrelid = 'ticket_queues'::regclass
      `.execute(app.db)
      const def = row.rows[0]?.def
      if (!def) throw new Error(`no constraint named ${constraint} on ticket_queues`)

      const values = [...def.matchAll(/'([^']+)'::text/g)].map((match) => match[1]).sort()
      if (values.length === 0) throw new Error(`no values read out of ${constraint}: ${def}`)
      return values
    }

    it.each<[string, string[]]>([
      ['ticket_queues_sort_by_check', sortFields],
      ['ticket_queues_sort_direction_check', sortDirections],
      ['ticket_queues_group_by_check', groupBy],
    ])('accepts in %s exactly what the contract lists', async (constraint, expected) => {
      expect(await valuesOfCheck(constraint)).toEqual([...expected].sort())
    })

    it('refuses a sort field the queue screen cannot sort by', async () => {
      const code = await codeOf(queue('Exclusões vencidas', { sort_by: 'prazo' }))

      expect(code).toBe(CHECK_VIOLATION)
    })

    it('refuses a sort direction outside asc and desc', async () => {
      const code = await codeOf(queue('Exclusões vencidas', { sort_direction: 'up' }))

      expect(code).toBe(CHECK_VIOLATION)
    })

    it('refuses a grouping the queue screen does not offer', async () => {
      const code = await codeOf(queue('Exclusões vencidas', { group_by: 'cliente' }))

      expect(code).toBe(CHECK_VIOLATION)
    })

    it('tells a view that imposes no grouping from one that imposes a flat list', async () => {
      await queue('Herda o agrupamento da pessoa')
      await queue('Lista plana', { group_by: 'none' })

      const rows = await app.db
        .selectFrom('ticket_queues')
        .select(['name', 'group_by'])
        .orderBy('name')
        .execute()

      expect(rows).toEqual([
        { name: 'Herda o agrupamento da pessoa', group_by: null },
        { name: 'Lista plana', group_by: 'none' },
      ])
    })
  })

  describe('who the view belongs to', () => {
    it('leaves a new view without an owner, which is the team view', async () => {
      await queue('MOV CLT')

      const row = await app.db
        .selectFrom('ticket_queues')
        .select(['owner_id', 'group_id'])
        .executeTakeFirstOrThrow()

      expect(row).toEqual({ owner_id: null, group_id: null })
    })

    it('keeps the owner of a personal view', async () => {
      await queue('Minhas exclusões', { owner_id: ANA })

      const row = await app.db
        .selectFrom('ticket_queues')
        .select('owner_id')
        .executeTakeFirstOrThrow()

      expect(row.owner_id).toBe(ANA)
    })

    it('refuses a view pointing at a group that does not exist', async () => {
      const code = await codeOf(
        queue('MOV CLT', { group_id: '00000000-0000-4000-8000-000000000099' }),
      )

      expect(code).toBe(FK_VIOLATION)
    })

    it('refuses to delete a group that still owns a saved view', async () => {
      const pod = await group('POD 5')
      await queue('MOV CLT', { group_id: pod })

      const code = await codeOf(app.db.deleteFrom('ticket_groups').where('id', '=', pod).execute())

      expect(code).toBe(FK_VIOLATION)
    })
  })

  describe('favorites', () => {
    it('lets two people favorite the same view', async () => {
      const id = await queue('MOV CLT')
      await favorite(id, ANA)
      await favorite(id, BRUNO)

      const rows = await app.db
        .selectFrom('ticket_queue_favorites')
        .select('user_id')
        .orderBy('user_id')
        .execute()

      expect(rows).toEqual([{ user_id: ANA }, { user_id: BRUNO }])
    })

    it('refuses the same person favoriting the same view twice', async () => {
      const id = await queue('MOV CLT')
      await favorite(id, ANA)

      const code = await codeOf(favorite(id, ANA))

      expect(code).toBe(UNIQUE_VIOLATION)
    })

    it('drops the favorites of a view that is deleted', async () => {
      const id = await queue('MOV CLT')
      await favorite(id, ANA)

      await app.db.deleteFrom('ticket_queues').where('id', '=', id).execute()

      const rows = await app.db.selectFrom('ticket_queue_favorites').selectAll().execute()
      expect(rows).toEqual([])
    })
  })
})
