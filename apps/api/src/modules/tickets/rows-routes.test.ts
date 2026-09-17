import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterEach, afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { businessToday } from '../../shared/business-date.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

const COMPANY = '00000000-0000-4000-8000-0000000000d1'

type Seed = {
  title: string | null
  carrierName?: string | null
  status?: string
  assigneeId?: string | null
  priority?: string | null
  actionDate?: string | null
  closedAt?: string | null
  product?: string | null
  contractType?: string | null
  companySize?: string | null
  relationship?: string | null
  parentCompanyId?: string | null
  parentCompanyName?: string | null
  companyTaxId?: string | null
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
      payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
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
          carrier_name: row.carrierName ?? null,
          parent_company_id: row.parentCompanyId ?? null,
          parent_company_name: row.parentCompanyName ?? null,
          company_tax_id: row.companyTaxId ?? null,
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

  const names = (body: { data: { beneficiaryName: string | null }[] }) =>
    body.data.map((row) => row.beneficiaryName).sort()

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

  /** The queue groups and filters by the parent, and the CNPJ is what tells
   *  apart two companies sharing a trade name — both have to ride the row. */
  it('carries the parent company and the company tax id of the branch', async () => {
    await seed([
      {
        title: 'a',
        parentCompanyId: '00000000-0000-4000-8000-0000000000a1',
        parentCompanyName: 'Meridiano Holding',
        companyTaxId: '11.111.111/0001-11',
      },
    ])

    const { body } = await get()

    expect(body.data[0]).toMatchObject({
      companyId: COMPANY,
      parentCompanyId: '00000000-0000-4000-8000-0000000000a1',
      parentCompanyName: 'Meridiano Holding',
      companyTaxId: '11.111.111/0001-11',
    })
  })

  /** `''` only gets into the column by hand or by a backfill. When it does, one
   *  row must not take the whole page down with it — the same rule the ticket
   *  detail already follows. */
  it('reads a blank company column as null, instead of failing the page', async () => {
    await seed([{ title: 'a', parentCompanyName: '', companyTaxId: '' }])

    const { status, body } = await get()

    expect(status).toBe(200)
    expect(body.data[0]).toMatchObject({ parentCompanyName: null, companyTaxId: null })
  })

  it('filters by the parent and reaches the branch, over the query string', async () => {
    await seed([
      { title: 'da-matriz' },
      {
        title: 'da-filial',
        parentCompanyId: '00000000-0000-4000-8000-0000000000a1',
        parentCompanyName: 'Meridiano Holding',
      },
    ])

    const byParent = await get('?companyIds=00000000-0000-4000-8000-0000000000a1')
    const exact = await get('?companyIdsExact=00000000-0000-4000-8000-0000000000a1')

    // Both rows carry COMPANY as their own company; only the second is a branch
    // of the parent asked for.
    expect(titles(byParent.body)).toEqual(['da-filial'])
    expect(titles(exact.body)).toEqual([])
  })

  it('says null for the parent of a company that is its own', async () => {
    await seed([{ title: 'a', companyTaxId: '11.111.111/0001-11' }])

    const { body } = await get()

    expect(body.data[0]).toMatchObject({
      parentCompanyId: null,
      parentCompanyName: null,
      companyTaxId: '11.111.111/0001-11',
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

  /* The web's `readString` skips a blank and tries the next spelling, so the
     server has to do the same or the queue shows an empty cell where the web
     shows a name. `coalesce` alone would not: it only falls through on NULL. */
  it('skips a blank spelling and reads the next one, as the row does', async () => {
    await seed([
      {
        title: 'a',
        snapshot: {
          company: { 'company-name': '', name: 'Acme Saúde' },
          primary: { profile: { 'preferred-name': '   ', name: 'Maria Souza', 'tax-id': '' } },
        },
      },
    ])

    const [row] = (await get()).body.data

    expect(row.companyName).toBe('Acme Saúde')
    expect(row.beneficiaryName).toBe('Maria Souza')
    /* Nothing left to fall through to: blank becomes null, never `''`. */
    expect(row.taxId).toBeNull()
  })

  /* `#>>` stringifies whatever it finds, so a number would arrive as "12345"
     while the web's `readString` — which demands a string — reads it as
     nothing and tries the next spelling. Same reading on both sides or the
     count stops matching the list. */
  it('ignores a value that is not a string, as the row does', async () => {
    await seed([
      {
        title: 'a',
        snapshot: {
          company: { 'company-name': 12345, name: 'Acme Saúde' },
          primary: { profile: { 'preferred-name': null, name: 'Maria Souza' } },
        },
      },
    ])

    const [row] = (await get()).body.data

    expect(row.companyName).toBe('Acme Saúde')
    expect(row.beneficiaryName).toBe('Maria Souza')
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

  it('searches the subject ignoring accent and case', async () => {
    await seed([
      { title: 'Inclusão de José Conceição' },
      { title: 'EXCLUSAO DE JOSE RIBEIRO' },
      { title: 'Mudança de plano de Marta Alves' },
    ])

    expect(titles((await get('?subjectQuery=jose')).body)).toEqual([
      'EXCLUSAO DE JOSE RIBEIRO',
      'Inclusão de José Conceição',
    ])
  })

  it('searches the subject the queue builds when no title was written', async () => {
    await seed([
      {
        title: null,
        carrierName: 'SulAmérica',
        product: 'dental-insurance',
        snapshot: { primary: { profile: { 'preferred-name': 'Beatriz Lima' } } },
      },
      {
        title: null,
        carrierName: 'Amil',
        product: 'health-insurance',
        snapshot: { primary: { profile: { 'preferred-name': 'Marta Ribeiro' } } },
      },
    ])

    const { body } = await get('?subjectQuery=beatriz')

    expect(body.data.map((row: { beneficiaryName: string }) => row.beneficiaryName)).toEqual([
      'Beatriz Lima',
    ])
  })

  /* The row and the search read the same spelling, or a ticket matches the
     filter while the name it matched on is not in the subject on screen. */
  it('searches the name in the spelling the row reads it, not only in kebab', async () => {
    await seed([
      {
        title: null,
        carrierName: 'Amil',
        snapshot: { primary: { profile: { preferredName: 'Beatriz Lima' } } },
      },
      {
        title: null,
        carrierName: 'Amil',
        snapshot: { primary: { profile: { preferred_name: 'Marta Ribeiro' } } },
      },
    ])

    const camel = await get('?subjectQuery=beatriz')
    const snake = await get('?subjectQuery=marta')

    expect(names(camel.body)).toEqual(['Beatriz Lima'])
    expect(names(snake.body)).toEqual(['Marta Ribeiro'])
  })

  it('reads the product as the screen shows it, not as the column stores it', async () => {
    await seed([
      {
        title: null,
        carrierName: 'SulAmérica',
        product: 'dental-insurance',
        snapshot: { primary: { profile: { 'preferred-name': 'Beatriz Lima' } } },
      },
    ])

    expect((await get('?subjectQuery=sulamerica%20%C2%B7%20dental')).body.total).toBe(1)
    expect((await get('?subjectQuery=dental-insurance')).body.total).toBe(0)
  })

  it('falls back to the id when the movement has no word to build a subject from', async () => {
    await seed([{ title: null }])
    const [{ id }] = (await get()).body.data as { id: string }[]

    expect((await get('?subjectQuery=marta')).body.data).toEqual([])
    expect((await get(`?subjectQuery=${id.slice(0, 8)}`)).body.total).toBe(1)
  })

  it('keeps the separator the subject is built with', async () => {
    await seed([
      { title: 'SulAmérica · Odonto · Beatriz Lima' },
      { title: 'SulAmérica · Saúde · Beatriz Lima' },
    ])

    expect(titles((await get('?subjectQuery=odonto%20%C2%B7%20beatriz')).body)).toEqual([
      'SulAmérica · Odonto · Beatriz Lima',
    ])
  })

  it('drops a query that folds to nothing, instead of taking every ticket with a subject', async () => {
    await seed([{ title: 'Inclusão de Marta' }])
    await app.db
      .insertInto('tickets')
      .values({
        enrollment_id: randomUUID(),
        enrollment_type: 'inclusion',
        company_id: COMPANY,
        source_system: 'enrollment-integrations',
        status: 'broker-processing',
        tags: [],
        title: null,
      })
      .execute()

    // `%CC%81` is a lone combining acute: non-empty for the schema, empty once folded.
    expect((await get('?subjectQuery=%CC%81')).body.total).toBe(2)
  })

  it('takes a percent sign as text, not as a wildcard', async () => {
    await seed([{ title: 'Reajuste de 10% na fatura' }, { title: 'Inclusão de Marta' }])

    expect(titles((await get('?subjectQuery=10%25%20na')).body)).toEqual([
      'Reajuste de 10% na fatura',
    ])
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
