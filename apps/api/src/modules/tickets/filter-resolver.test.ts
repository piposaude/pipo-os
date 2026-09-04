import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { expressionBuilder, sql } from 'kysely'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import type { Database } from '../../infrastructure/db.js'
import { ticketFilterSchema, type TicketFilter } from './filter-schema.js'
import {
  actionDateWindowCondition,
  FIELD_RESOLVERS,
  ticketFilterConditions,
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
  carrierId?: string | null
  product?: string | null
  contractType?: string | null
  companySize?: string | null
  relationship?: string | null
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
          carrier_id: row.carrierId ?? null,
          product: row.product ?? null,
          contract_type: row.contractType ?? null,
          company_size: row.companySize ?? null,
          relationship: row.relationship ?? null,
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
      { id: 'fechado-sem-data', actionDate: null, closedAt: '2026-09-01T10:00:00.000Z' },
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

      expect(await matching({}, 'all')).toEqual([
        'fechado-sem-data',
        'futura',
        'hoje',
        'no-limite',
        'sem-data',
      ])
    })

    /** The web reads the day off the ISO string, in UTC. A cut that trusted
     *  the session TimeZone would put 01:30Z on the previous day in São Paulo. */
    it('cuts the day in UTC whatever the session time zone is', async () => {
      await seed([{ id: 'vira-o-dia', actionDate: '2026-09-05T01:30:00.000Z' }])

      const titles = await app.db.transaction().execute(async (trx) => {
        await sql`SET LOCAL TIME ZONE 'America/Sao_Paulo'`.execute(trx)
        const found = await trx
          .selectFrom('tickets')
          .select('title')
          .where(actionDateWindowCondition('sleeping', TODAY)!)
          .execute()
        return found.map((row) => row.title)
      })

      expect(titles).toEqual(['vira-o-dia'])
    })
  })

  it('filters by carrier and relationship, which need no translation', async () => {
    await seed([
      { id: 'unimed-titular', carrierId: 'carrier-unimed', relationship: 'holder' },
      { id: 'amil-dependente', carrierId: 'carrier-amil', relationship: 'dependent' },
    ])

    expect(await matching({ carrierIds: ['carrier-unimed'] })).toEqual(['unimed-titular'])
    expect(await matching({ relationships: ['dependent'] })).toEqual(['amil-dependente'])
  })

  it('translates the client word back to what the column stores', async () => {
    await seed([
      { id: 'corporate-pj', companySize: 'corporate', contractType: 'services-contract' },
      { id: 'smb-clt', companySize: 'smb', contractType: 'brazil-labor-law' },
    ])

    expect(await matching({ companySizes: ['enterprise'] })).toEqual(['corporate-pj'])
    expect(await matching({ contractTypes: ['clt'] })).toEqual(['smb-clt'])
  })

  it('matches both forms of a product under one client word', async () => {
    await seed([
      { id: 'forma-curta', product: 'health' },
      { id: 'forma-canonica', product: 'health-insurance' },
      { id: 'outro', product: 'dental' },
    ])

    expect(await matching({ products: ['health'] })).toEqual(['forma-canonica', 'forma-curta'])
  })

  it('keeps a value it cannot translate instead of dropping the row', async () => {
    await seed([
      { id: 'estagiario', contractType: 'intern' },
      { id: 'mental', product: 'mental-health' },
    ])

    expect(await matching({ contractTypes: ['intern'] })).toEqual(['estagiario'])
    expect(await matching({ products: ['mental-health'] })).toEqual(['mental'])
  })

  it('treats a null contract type as a value of its own', async () => {
    await seed([
      { id: 'sem-contrato', contractType: null },
      { id: 'com-contrato', contractType: 'services-contract' },
    ])

    expect(await matching({ contractTypes: [null] })).toEqual(['sem-contrato'])
  })

  it('matches nothing for a filter written in the word the column stores', async () => {
    await seed([
      { id: 'smb', companySize: 'smb' },
      { id: 'canonica', product: 'health-insurance' },
    ])

    // The web never sees `smb` or `health-insurance` on a row, so it cannot
    // match them; the server must agree, or a node announces one number and
    // lists another.
    expect(await matching({ companySizes: ['smb'] })).toEqual([])
    expect(await matching({ products: ['health-insurance'] })).toEqual([])
  })
})

/** The type catches a missing field; this catches a surplus one. */
describe('FIELD_RESOLVERS', () => {
  it('names exactly the fields the contract declares', () => {
    const declared = Object.keys(ticketFilterSchema.shape).sort()

    expect(Object.keys(FIELD_RESOLVERS).sort()).toEqual(declared)
  })

  /** One set value per field. The mapped type makes a field added to the
   *  schema demand a sample here, and an entry that resolves to nothing fails
   *  this test instead of dropping the criterion from the query in silence. */
  const SAMPLE: { [K in keyof TicketFilter]-?: NonNullable<TicketFilter[K]> } = {
    statuses: ['completed'],
    companyIds: [COMPANY_A],
    carrierIds: ['carrier-amil'],
    products: ['health'],
    types: ['inclusion'],
    companySizes: ['pme'],
    contractTypes: ['pj'],
    relationships: ['holder'],
    origins: ['web'],
    groupIds: [COMPANY_A],
    tags: ['vip'],
    assigneeIds: ['@me'],
    priorities: ['high'],
    actionDateBefore: TODAY,
    urgentBy: TODAY,
    createdSince: TODAY,
    archived: false,
  }

  it.each(Object.keys(SAMPLE) as (keyof TicketFilter)[])(
    'turns %s into a condition instead of dropping it',
    (field) => {
      const eb = expressionBuilder<Database, 'tickets'>()
      // A computed key widens to an index signature; the cast narrows it back.
      const filter = { [field]: SAMPLE[field] } as TicketFilter

      expect(ticketFilterConditions(eb, filter, VIEWER)).toHaveLength(1)
    },
  )
})
