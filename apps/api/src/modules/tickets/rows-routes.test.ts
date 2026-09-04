import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterEach, afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { businessToday } from '../../shared/business-date.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

const COMPANY = '00000000-0000-4000-8000-0000000000d1'

type Seed = {
  title: string
  status?: string
  assigneeId?: string | null
  priority?: string | null
  actionDate?: string | null
  closedAt?: string | null
  product?: string | null
  contractType?: string | null
  companySize?: string | null
  relationship?: string | null
  snapshot?: Record<string, unknown>
}

describe('GET /api/tickets/rows', () => {
  let app: FastifyInstance
  let cookie: string
  /** Asked, not assumed: the dev login mints its own address. */
  let viewer: string
  /** Instants at noon in São Paulo, `days` from the operation's today. */
  const inDays = (days: number): string =>
    new Date(Date.parse(`${businessToday()}T15:00:00.000Z`) + days * 86_400_000).toISOString()

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: {},
      remoteAddress: '127.0.0.1',
    })
    cookie = login.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE_NAME]: cookie },
    })
    viewer = me.json().email
  })

  afterEach(async () => {
    await app.db.deleteFrom('tickets').execute()
  })

  afterAll(async () => {
    await app.close()
  })

  const seed = async (rows: Seed[]): Promise<void> => {
    await app.db
      .insertInto('tickets')
      .values(
        rows.map((row) => ({
          enrollment_id: randomUUID(),
          enrollment_type: 'inclusion',
          company_id: COMPANY,
          source_system: 'enrollment-integrations',
          status: row.status ?? 'broker-processing',
          assignee_id: row.assigneeId ?? null,
          priority: row.priority ?? null,
          action_date: row.actionDate ?? null,
          closed_at: row.closedAt ?? null,
          product: row.product ?? null,
          contract_type: row.contractType ?? null,
          company_size: row.companySize ?? null,
          relationship: row.relationship ?? null,
          enrollment_snapshot: JSON.stringify(row.snapshot ?? {}),
          tags: [],
          title: row.title,
        })),
      )
      .execute()
  }

  const get = async (query = '') => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/tickets/rows${query}`,
      cookies: { [SESSION_COOKIE_NAME]: cookie },
    })
    return { status: response.statusCode, body: response.json() }
  }

  const titles = (body: { data: { title: string | null }[] }) =>
    body.data.map((row) => row.title).sort()

  it('does not carry the snapshot, which is the point of the endpoint', async () => {
    await seed([{ title: 'a', snapshot: { huge: 'x'.repeat(1000) } }])

    const { body } = await get()

    expect(body.data).toHaveLength(1)
    expect(body.data[0]).not.toHaveProperty('enrollmentSnapshot')
  })

  it('digs out of the snapshot only what has no column', async () => {
    await seed([
      {
        title: 'a',
        snapshot: {
          company: { company_name: 'Caiçara Metalurgia' },
          primary: { profile: { name: 'Renata', tax_id: '266.348.750-73' } },
        },
      },
    ])

    const { body } = await get()

    expect(body.data[0]).toMatchObject({
      companyName: 'Caiçara Metalurgia',
      beneficiaryName: 'Renata',
      taxId: '266.348.750-73',
    })
  })

  it('prefers the social name, as the row does', async () => {
    await seed([
      {
        title: 'a',
        snapshot: { primary: { profile: { name: 'Registro', preferred_name: 'Social' } } },
      },
    ])

    expect((await get()).body.data[0].beneficiaryName).toBe('Social')
  })

  it('reads the snapshot with a hyphen too, since the contract is not frozen', async () => {
    await seed([{ title: 'a', snapshot: { company: { 'company-name': 'Caiçara' } } }])

    expect((await get()).body.data[0].companyName).toBe('Caiçara')
  })

  it('takes a repeated parameter as one filter with several values', async () => {
    await seed([
      { title: 'faltando', status: 'missing-documents' },
      { title: 'incorreto', status: 'incorrect-data' },
      { title: 'corretora', status: 'broker-processing' },
    ])

    const { body } = await get('?statuses=missing-documents&statuses=incorrect-data')

    expect(titles(body)).toEqual(['faltando', 'incorreto'])
  })

  it('narrows further with every field added, as the panel accumulates them', async () => {
    await seed([
      {
        title: 'urgente-da-ana',
        status: 'missing-documents',
        assigneeId: viewer,
        priority: 'urgent',
      },
      {
        title: 'urgente-de-outro',
        status: 'missing-documents',
        assigneeId: 'bruno@pipo.health',
        priority: 'urgent',
      },
      { title: 'baixa-da-ana', status: 'missing-documents', assigneeId: viewer, priority: 'low' },
    ])

    const { body } = await get('?statuses=missing-documents&assigneeIds=@me&priorities=urgent')

    expect(titles(body)).toEqual(['urgente-da-ana'])
  })

  it('reads @none as the null the panel offers', async () => {
    await seed([
      { title: 'livre', assigneeId: null },
      { title: 'atribuido', assigneeId: viewer },
    ])

    expect(titles((await get('?assigneeIds=@none')).body)).toEqual(['livre'])
  })

  it('translates the client word into what the column stores', async () => {
    await seed([
      { title: 'grande', companySize: 'corporate' },
      { title: 'pequena', companySize: 'smb' },
    ])

    expect(titles((await get('?companySizes=enterprise')).body)).toEqual(['grande'])
  })

  it('opens on the awake window, hiding what is due further out', async () => {
    await seed([
      { title: 'sem-data', actionDate: null },
      { title: 'hoje', actionDate: inDays(0) },
      { title: 'futura', actionDate: inDays(10) },
    ])

    expect(titles((await get()).body)).toEqual(['hoje', 'sem-data'])
    expect(titles((await get('?window=sleeping')).body)).toEqual(['futura'])
    expect(titles((await get('?window=all')).body)).toEqual(['futura', 'hoje', 'sem-data'])
  })

  /** `total` counts what matched, so the caller can tell the limit cut. */
  it('cuts at the limit but still reports how many matched', async () => {
    await seed([{ title: 'a' }, { title: 'b' }, { title: 'c' }])

    const { body } = await get('?limit=2')

    expect(body.data).toHaveLength(2)
    expect(body.total).toBe(3)
  })

  it('reads a camelCase snapshot too, not only snake and kebab', async () => {
    await seed([{ title: 'a', snapshot: { primary: { profile: { taxId: '111', name: 'Ana' } } } }])

    expect((await get()).body.data[0].taxId).toBe('111')
  })

  it('refuses a status the contract does not know instead of ignoring it', async () => {
    const { status } = await get('?statuses=inventado')

    expect(status).toBe(400)
  })

  it('requires a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/tickets/rows' })

    expect(response.statusCode).toBe(401)
  })
})
