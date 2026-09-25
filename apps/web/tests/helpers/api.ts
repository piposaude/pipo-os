import { FIXTURE_USER_NAMES, queueSeed, structureFixture } from '../fixtures/pipodesk/dataset'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import type { Person } from '@/lib/pipodesk/record'
import { records } from '../fixtures/pipodesk/records'

/** Answer for any ticket id without a route of its own. */
export const TICKET_ROUTE = '/api/tickets/:id'
export const TIMELINE_ROUTE = '/api/tickets/:id/timeline'

export interface ApiCall {
  method: string
  path: string
  body: unknown
}

export interface ApiMock {
  restore: () => void
  calls: ApiCall[]
  failReads: boolean
}

/** A write route with any `:param` segment, e.g. `DELETE /api/groups/:id/members/:memberId`. */
function routeByPattern(
  routes: Record<string, unknown>,
  method: string,
  pathname: string,
): unknown {
  for (const [key, handler] of Object.entries(routes)) {
    const [routeMethod, pattern] = key.split(' ')
    if (routeMethod !== method || !pattern?.includes(':')) continue
    const regex = new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`)
    if (regex.test(pathname)) return handler
  }
  return undefined
}

/** Restores by assignment, never `unstubAllGlobals()`: the setup file stubs
 *  `Request`, and unstubbing here would take it down with it. */
export function mockApi(
  routes: Record<string, unknown>,
  writes: Record<string, number> = {},
): ApiMock {
  const original = globalThis.fetch
  const calls: ApiCall[] = []
  const applied = new Map<string, Record<string, unknown>>()
  const mock = { calls, failReads: false } as ApiMock

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const { pathname } = new URL(url, 'http://localhost')

    if (method !== 'GET') {
      const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : null)
      const body = typeof raw === 'string' && raw !== '' ? JSON.parse(raw) : null
      calls.push({ method, path: pathname, body })

      const handler =
        routes[`${method} ${pathname}`] ??
        routes[`${method} ${pathname.replace(/\/[^/]+$/, '/:id')}`] ??
        routeByPattern(routes, method, pathname)
      if (typeof handler === 'function') {
        const answer = (await handler(body, pathname)) as { status: number; body?: unknown }
        return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
          status: answer.status,
          headers: { 'content-type': 'application/json' },
        })
      }

      const status = writes[`${method} ${pathname}`] ?? writes[method] ?? 204
      // A write the server accepted has to show up on the next read, or the
      // screen would be tested against a server that forgets.
      if (status === 204) {
        const id = pathname.replace(/^\/api\/tickets\//, '').replace(/\/status$/, '')
        applied.set(id, { ...applied.get(id), ...(body as Record<string, unknown>) })
      }
      return new Response(status === 204 ? null : JSON.stringify({ message: 'recusado' }), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (mock.failReads) {
      return new Response(JSON.stringify({ message: 'indisponível' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (pathname === '/api/tickets/rows' && applied.size > 0) {
      const rows = JSON.parse(
        typeof routes[pathname] === 'string'
          ? (routes[pathname] as string)
          : JSON.stringify(routes[pathname]),
      ) as { data: { id: string }[] }
      rows.data = rows.data.map((row) =>
        applied.has(row.id) ? { ...row, ...applied.get(row.id) } : row,
      )
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const ticketId = /^\/api\/tickets\/([^/]+)$/.exec(pathname)?.[1]
    const timelineOf = /^\/api\/tickets\/[^/]+\/timeline$/.test(pathname)
    const route =
      routes[pathname] ??
      (ticketId ? routes[TICKET_ROUTE] : timelineOf ? routes[TIMELINE_ROUTE] : undefined)
    let body = typeof route === 'function' ? route(new URL(url, 'http://localhost')) : route
    if (ticketId && body !== undefined && applied.has(ticketId)) {
      body = { ...(body as Record<string, unknown>), ...applied.get(ticketId) }
    }
    if (body === undefined) {
      return new Response(JSON.stringify({ message: `sem mock para ${pathname}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof globalThis.fetch

  mock.restore = () => {
    globalThis.fetch = original
  }
  return mock
}

export const page = <T>(data: T[]) => ({ data, total: data.length, page: 1, pageSize: 100 })

const STAMPS = {
  createdBy: 'fixture@piposaude.com.br',
  updatedBy: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

export function fixtureStructureRoutes(viewerId?: string): Record<string, unknown> {
  return {
    '/api/tickets/rows': fixtureRowsRoute(),
    [TICKET_ROUTE]: fixtureTicketRoute,
    [TIMELINE_ROUTE]: { data: [] },
    '/api/users': fixtureUsersRoute(),
    '/api/groups': page(
      structureFixture.groups.map((group) => ({
        ...STAMPS,
        id: group.id,
        name: group.name,
        parentId: group.parentId,
        companyIds: group.companyIds,
        members: structureFixture.memberships
          .filter((membership) => membership.groupId === group.id)
          .map((membership) => ({
            userId: membership.userId,
            role: membership.role,
            active: true,
            companyIds: membership.companyIds ?? [],
          })),
      })),
    ),
    '/api/queues': page(
      structureFixture.queues.map((queue) => ({
        ...STAMPS,
        id: queue.id,
        name: queue.name,
        groupId: queue.groupId,
        ownerId: queue.ownerId,
        filters: queue.filter,
        sort: queue.sort,
        groupBy: queue.groupBy ?? null,
        favorite: viewerId ? queue.subscriberIds.includes(viewerId) : false,
      })),
    ),
  }
}

let rowsBody: string | null = null

/** The holder's CPF, which the API reads off the snapshot into every row. */
export function taxIdOf(ticketId: string): string | null {
  const movement = records.movementOf(ticketId)
  const moved = movement ? records.personById.get(movement.beneficiaryId) : undefined
  const holder =
    moved?.role === 'dependent' && moved.holderId ? records.personById.get(moved.holderId) : moved
  return holder?.cpf ?? null
}

export function fixtureRowsRoute(): string {
  rowsBody ??= JSON.stringify({
    data: queueSeed.map((row) => ({
      ...row,
      taxId: taxIdOf(row.id),
      companyTaxId: records.companyById.get(row.companyId)?.cnpj ?? null,
      title: row.subject,
      displayNumber: row.displayNumber ?? row.id,
      // The projection sends an instant, never a day: noon in São Paulo, so the
      // conversion back lands on the same date the fixture spells out.
      actionDate: row.actionDate === null ? null : `${row.actionDate}T12:00:00-03:00`,
    })),
    total: queueSeed.length,
  })
  return rowsBody
}

/** The ticket as `GET /api/tickets/:id` sends it, over a queue row; the
 *  snapshot is the prototype record in the EI's shape, minus what the EI never sends. */
export function apiTicketOf(row: TicketRow): Record<string, unknown> {
  return {
    ...row,
    title: row.subject,
    displayNumber: row.displayNumber ?? row.id,
    actionDate: row.actionDate === null ? null : `${row.actionDate}T12:00:00-03:00`,
    queueId: null,
    pendingDocumentation: records.movementOf(row.id)?.pendingDocumentation ?? [],
    requester: null,
    collaborators: [],
    forceCompletion: false,
    origin: null,
    parentTicketId: null,
    completion: null,
    enrollmentSnapshot: snapshotOf(row),
  }
}

/** The EI's own words, which the API translates into the ticket columns. */
const EI_WORD: Record<string, string> = {
  clt: 'brazil-labor-law',
  pj: 'services-contract',
  pme: 'smb',
  'pme-plus': 'smb-plus',
  enterprise: 'corporate',
}

const personPayload = (person: Person, product: string | null) => {
  const card = person.cards.find((c) => c.product === product) ?? person.cards[0]
  return {
    member_id: person.id,
    profile: {
      tax_id: person.cpf,
      name: person.name,
      preferred_name: person.socialName ?? undefined,
      mothers_name: person.motherName ?? undefined,
      date_of_birth: person.birthDate ?? undefined,
      gender: person.sex === 'f' ? 'female' : person.sex === 'm' ? 'male' : undefined,
      marital_status: person.maritalStatus ?? undefined,
    },
    contact: {
      email: person.email ?? undefined,
      phone: person.phone ?? undefined,
      address: person.address && {
        postal_code: person.address.zip,
        street: person.address.street,
        number: person.address.number,
        complement: person.address.complement ?? undefined,
        neighborhood: person.address.district,
        city: person.address.city,
        state: person.address.uf,
      },
    },
    health_info: {
      weight_kg: person.weightKg ?? undefined,
      height_cm: person.heightCm ?? undefined,
    },
    benefit: card && { id_card_number: card.number, start_date: card.validFrom ?? undefined },
    bank_data: person.bankAccount && {
      bank_number: person.bankAccount.bank,
      branch_number: person.bankAccount.agency,
      account_number: person.bankAccount.account,
      account_owners_tax_id: person.bankAccount.holderCpf,
      account_owners_name: person.bankAccount.holderName,
    },
    employment: person.role === 'holder' &&
      person.link && {
        admission_date: person.link.admissionDate ?? undefined,
        employee_id: person.link.registration ?? undefined,
        contract_type:
          EI_WORD[person.link.contractType ?? ''] ?? person.link.contractType ?? undefined,
        job_title: person.link.jobTitle ?? undefined,
        monthly_salary:
          person.link.salaryCents === null ? undefined : person.link.salaryCents / 100,
        cost_center: person.link.costCenter ?? undefined,
      },
    documents: [] as { type: string; path: string }[],
  }
}

function snapshotOf(row: TicketRow): Record<string, unknown> {
  const movement = records.movementOf(row.id)
  const company = records.companyById.get(row.companyId)
  const parent = row.parentCompanyId ? records.companyById.get(row.parentCompanyId) : undefined
  const snapshot: Record<string, unknown> = {
    company: {
      company_name: company?.tradeName ?? row.companyName ?? undefined,
      company_tax_id: company?.cnpj ?? undefined,
      company_size: EI_WORD[company?.porte ?? ''] ?? company?.porte ?? undefined,
      parent_company_name: parent?.tradeName ?? row.parentCompanyName ?? undefined,
      parent_company_tax_id: parent?.cnpj ?? undefined,
    },
  }
  if (!movement) {
    snapshot.primary = { profile: { name: row.beneficiaryName, tax_id: row.taxId } }
    return snapshot
  }

  const moved = records.personById.get(movement.beneficiaryId)
  const holder =
    moved?.role === 'dependent' && moved.holderId ? records.personById.get(moved.holderId) : moved
  const dependentIds =
    moved && moved !== holder ? [moved.id, ...movement.dependentIds] : movement.dependentIds
  const policy = records.policyById.get(movement.policyId)
  const contract = policy
    ? records
        .contractsOf(policy.companyId)
        .find((c) => c.carrierId === policy.carrierId && c.product === policy.product)
    : undefined
  const ticketDocs = records
    .documentsOf('ticket', row.id)
    .filter((doc) => doc.origin === 'client')
    .map((doc) => ({
      type: doc.kind,
      path: `s3://enrollment/${row.id}/${doc.name}`,
    }))
  const primary = holder
    ? { ...personPayload(holder, row.product), documents: ticketDocs }
    : { profile: {} }

  return {
    ...snapshot,
    member_type: moved && moved !== holder ? 'dependent' : 'primary',
    member_id: moved?.id,
    primary,
    dependents: dependentIds
      .map((id) => records.personById.get(id))
      .filter((person): person is Person => person !== undefined)
      .map((person) => personPayload(person, row.product)),
    contract: policy && {
      id: policy.id,
      contract_number: contract?.number,
      plan_code: policy.code ?? undefined,
      product_type: policy.product,
      product_name: policy.name ?? undefined,
    },
    benefit_policy: contract && {
      coverage_start_date: contract.startDate ?? undefined,
      coverage_end_date: contract.endDate ?? undefined,
    },
  }
}

function fixtureTicketRoute(url: URL): Record<string, unknown> | undefined {
  const id = url.pathname.split('/').pop()
  const row = queueSeed.find((candidate) => candidate.id === id)
  return row ? apiTicketOf(row) : undefined
}

export const truncatedRowsRoute = (total: number): string =>
  JSON.stringify({ ...JSON.parse(fixtureRowsRoute()), total })

export function fixtureUsersRoute(): unknown {
  return {
    data: Object.entries(FIXTURE_USER_NAMES).map(([userId, name]) => ({
      email: userId,
      name,
    })),
  }
}

/** Holds every `method` request to `path` until `release` runs, so a test can
 *  look at the screen while it is still in flight. Wraps the API mock, so it
 *  has to come after it — and the mock's own `restore` undoes both. */
export function holdRequest(method: string, path: string): () => void {
  const inner = globalThis.fetch
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const sent = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (sent === method && new URL(url, 'http://localhost').pathname === path) await released
    return inner(input, init)
  }) as typeof globalThis.fetch

  return release
}

export const holdGet = (path: string): (() => void) => holdRequest('GET', path)
