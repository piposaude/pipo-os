import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import type { TicketFilter } from './filter-schema.js'
import {
  actionDateWindowCondition,
  ticketFilterConditions,
  UnsupportedFilterField,
  type ActionDateWindow,
} from './filter-resolver.js'

const VIEWER = 'ana@pipo.health'
const BRUNO = 'bruno@pipo.health'
const COMPANY_A = '00000000-0000-4000-8000-00000000000a'
const COMPANY_B = '00000000-0000-4000-8000-00000000000b'
const TODAY = '2026-09-02'

type Seed = {
  id: string
  status?: string
  companyId?: string
  enrollmentType?: string
  sourceSystem?: string
  assigneeId?: string | null
  priority?: string | null
  tags?: string[]
  actionDate?: string | null
  createdAt?: string
  closedAt?: string | null
}

describe('ticketFilterConditions — the saved filter, resolved in SQL', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(async () => {
    await app.db.deleteFrom('tickets').execute()
  })

  const seed = async (rows: Seed[]): Promise<void> => {
    await app.db
      .insertInto('tickets')
      .values(
        rows.map((row) => ({
          enrollment_id: randomUUID(),
          enrollment_type: row.enrollmentType ?? 'inclusion',
          company_id: row.companyId ?? COMPANY_A,
          source_system: row.sourceSystem ?? 'enrollment-integrations',
          status: row.status ?? 'broker-processing',
          assignee_id: row.assigneeId ?? null,
          priority: row.priority ?? null,
          tags: row.tags ?? [],
          action_date: row.actionDate ?? null,
          closed_at: row.closedAt ?? null,
          ...(row.createdAt !== undefined && { created_at: row.createdAt }),
          title: row.id,
        })),
      )
      .execute()
  }

  const matching = async (filter: TicketFilter, window?: ActionDateWindow): Promise<string[]> => {
    const rows = await app.db
      .selectFrom('tickets')
      .select('title')
      .where((eb) => {
        const parts = ticketFilterConditions(eb, filter, VIEWER)
        const w = window ? actionDateWindowCondition(window, TODAY) : null
        return eb.and(w ? [...parts, w] : parts)
      })
      .execute()
    return rows.map((row) => row.title!).sort()
  }

  it('keeps everything when the filter has no criteria', async () => {
    await seed([{ id: 'a' }, { id: 'b' }])

    expect(await matching({})).toEqual(['a', 'b'])
  })

  it('reads a list as an OR, and two fields as an AND', async () => {
    await seed([
      { id: 'a', status: 'missing-documents', companyId: COMPANY_A },
      { id: 'b', status: 'incorrect-data', companyId: COMPANY_B },
      { id: 'c', status: 'completed', companyId: COMPANY_A },
    ])

    expect(await matching({ statuses: ['missing-documents', 'incorrect-data'] })).toEqual([
      'a',
      'b',
    ])
    expect(
      await matching({
        statuses: ['missing-documents', 'incorrect-data'],
        companyIds: [COMPANY_A],
      }),
    ).toEqual(['a'])
  })

  it('asks for all the tags listed, not any of them', async () => {
    await seed([
      { id: 'ambos', tags: ['vip', 'urgente'] },
      { id: 'so-vip', tags: ['vip'] },
      { id: 'extra', tags: ['vip', 'urgente', 'outra'] },
    ])

    expect(await matching({ tags: ['vip', 'urgente'] })).toEqual(['ambos', 'extra'])
  })

  it('treats null as a value in assigneeIds and priorities', async () => {
    await seed([
      { id: 'livre', assigneeId: null, priority: null },
      { id: 'da-ana', assigneeId: VIEWER, priority: 'high' },
      { id: 'do-bruno', assigneeId: BRUNO, priority: 'low' },
    ])

    expect(await matching({ assigneeIds: [null] })).toEqual(['livre'])
    expect(await matching({ assigneeIds: [BRUNO, null] })).toEqual(['do-bruno', 'livre'])
    expect(await matching({ priorities: [null, 'low'] })).toEqual(['do-bruno', 'livre'])
  })

  it('resolves @me to the caller, so a shared queue is personal', async () => {
    await seed([
      { id: 'da-ana', assigneeId: VIEWER },
      { id: 'do-bruno', assigneeId: BRUNO },
    ])

    expect(await matching({ assigneeIds: ['@me'] })).toEqual(['da-ana'])
  })

  it('cuts dates by day, ignoring the time the column carries', async () => {
    await seed([
      { id: 'antes', actionDate: '2026-09-01T23:00:00.000Z' },
      { id: 'no-dia', actionDate: '2026-09-02T01:00:00.000Z' },
      { id: 'sem-data', actionDate: null },
    ])

    expect(await matching({ actionDateBefore: '2026-09-02' })).toEqual(['antes'])
  })

  it('matches urgent or overdue, the filter’s only OR', async () => {
    await seed([
      { id: 'urgente', priority: 'urgent', actionDate: null },
      { id: 'atrasado', priority: 'low', actionDate: '2026-09-01T10:00:00.000Z' },
      { id: 'nem-um-nem-outro', priority: 'low', actionDate: '2026-09-10T10:00:00.000Z' },
    ])

    expect(await matching({ urgentBy: TODAY })).toEqual(['atrasado', 'urgente'])
  })

  it('cuts by creation day and by archived', async () => {
    await seed([
      { id: 'novo', createdAt: '2026-09-02T08:00:00.000Z' },
      { id: 'velho', createdAt: '2026-08-01T08:00:00.000Z' },
      {
        id: 'fechado',
        createdAt: '2026-09-02T08:00:00.000Z',
        closedAt: '2026-09-02T09:00:00.000Z',
      },
    ])

    expect(await matching({ createdSince: '2026-09-01' })).toEqual(['fechado', 'novo'])
    expect(await matching({ archived: false })).toEqual(['novo', 'velho'])
    expect(await matching({ archived: true })).toEqual(['fechado'])
  })

  describe('the action-date window', () => {
    const rows: Seed[] = [
      { id: 'sem-data', actionDate: null },
      { id: 'hoje', actionDate: '2026-09-02T10:00:00.000Z' },
      { id: 'no-limite', actionDate: '2026-09-04T10:00:00.000Z' },
      { id: 'futura', actionDate: '2026-09-05T10:00:00.000Z' },
    ]

    it('keeps what is due within two days awake, plus what has no date', async () => {
      await seed(rows)

      expect(await matching({}, 'awake')).toEqual(['hoje', 'no-limite', 'sem-data'])
    })

    it('inverts the window for the future-moves node', async () => {
      await seed(rows)

      expect(await matching({}, 'sleeping')).toEqual(['futura'])
    })

    it('crosses the window when the node asks for everything', async () => {
      await seed(rows)

      expect(await matching({}, 'all')).toEqual(['futura', 'hoje', 'no-limite', 'sem-data'])
    })
  })

  it('refuses a snapshot-derived field instead of ignoring it', async () => {
    await seed([{ id: 'a' }])

    await expect(matching({ carrierIds: ['unimed'] })).rejects.toThrow(UnsupportedFilterField)
    await expect(matching({ relationships: ['holder'] })).rejects.toThrow(UnsupportedFilterField)

    // 422 and not 500: an unresolvable saved filter is the client's data.
    await expect(matching({ carrierIds: ['unimed'] })).rejects.toMatchObject({
      statusCode: 422,
    })
  })
})
