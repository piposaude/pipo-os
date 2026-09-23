import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'

function cookieValue(
  response: { cookies: Array<{ name: string; value: string }> },
  name: string,
): string | null {
  return response.cookies.find((cookie) => cookie.name === name)?.value ?? null
}

const DEV_LOGIN_USER_ID = 'dev@piposaude.com.br'
const USER_ID_1 = '00000000-0000-4000-8000-000000000001'
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000099'
const COMPANY_A = '00000000-0000-4000-8000-00000000000a'
const COMPANY_B = '00000000-0000-4000-8000-00000000000b'

describe('groups routes', () => {
  let app: FastifyInstance
  let sessionCookie: string

  beforeAll(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    app = buildApp()
    await app.ready()

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: ['admin/allow/administrate/pipodesk/structure'] },
    })
    sessionCookie = cookieValue(loginResponse, SESSION_COOKIE_NAME)!
  })

  afterAll(async () => {
    await app.close()
    delete process.env.DEV_LOGIN_ENABLED
  })

  /* Leaf tables first, because the FKs demand it: `member_companies` points at
     both `companies` and `members`. A table added in the wrong position here
     reintroduces FK violations that read as unrelated test failures. */
  afterEach(async () => {
    await app.db.deleteFrom('ticket_comments').execute()
    await app.db.deleteFrom('tickets').execute()
    await app.db.deleteFrom('ticket_queues').execute()
    await app.db.deleteFrom('ticket_group_member_companies').execute()
    await app.db.deleteFrom('ticket_group_companies').execute()
    await app.db.deleteFrom('ticket_group_members').execute()
    await app.db.deleteFrom('ticket_groups').execute()
  })

  const createGroup = async (name: string, parentId?: string | null): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/groups',
      payload: { name, ...(parentId !== undefined && { parentId }) },
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })
    expect(response.statusCode).toBe(201)
    return response.json().id as string
  }

  // ---------------------------------------------------------------------------
  describe('POST /api/groups', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Operações' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('creates a group and returns 201', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Operações' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.id).toBeTruthy()
      expect(body.name).toBe('Operações')
      expect(body.createdBy).toBe(DEV_LOGIN_USER_ID)
      expect(body.createdAt).toBeTruthy()
      expect(body.updatedAt).toBeTruthy()
    })

    it('returns 400 when name is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: {},
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when name is empty string', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: '' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    /** `min(1)` counts characters, and a space is a character: without a trim
     *  the group is created named " " and no search ever finds it. */
    it('returns 400 when name is only whitespace', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: '   ' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('stores the name trimmed, so two groups cannot differ by a space', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: '  Operações  ' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().name).toBe('Operações')
    })

    it('returns 400 for unknown field (strict schema)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo', campoInexistente: 'valor' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('creates a group without a parent and reports parentId as null', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Gestão de Benefícios' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().parentId).toBeNull()
    })

    it('nests a group under its parent', async () => {
      const geben = await createGroup('Gestão de Benefícios')

      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'POD 3', parentId: geben },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().parentId).toBe(geben)
    })

    it('returns 400 when parentId is not a uuid', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'POD 3', parentId: 'geben' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  describe('GET /api/groups', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/groups' })
      expect(response.statusCode).toBe(401)
    })

    it('returns empty list when no groups exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/groups',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data).toEqual([])
      expect(body.total).toBe(0)
      expect(body.page).toBe(1)
      expect(body.pageSize).toBe(20)
    })

    it('returns all created groups', async () => {
      const alpha = await createGroup('Alpha')
      await createGroup('Beta', alpha)

      const response = await app.inject({
        method: 'GET',
        url: '/api/groups',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.total).toBe(2)
      expect(body.data).toHaveLength(2)
    })

    it('filters groups by name (case-insensitive)', async () => {
      const dental = await createGroup('Operações Dental')
      await createGroup('Suporte Médico', dental)

      const response = await app.inject({
        method: 'GET',
        url: '/api/groups?name=dental',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.total).toBe(1)
      expect(body.data[0].name).toBe('Operações Dental')
    })

    it('paginates results', async () => {
      const raiz = await createGroup('Grupo 1')
      await createGroup('Grupo 2', raiz)
      await createGroup('Grupo 3', raiz)

      const page1 = await app.inject({
        method: 'GET',
        url: '/api/groups?page=1&pageSize=2',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(page1.statusCode).toBe(200)
      const body1 = page1.json()
      expect(body1.total).toBe(3)
      expect(body1.data).toHaveLength(2)
      expect(body1.page).toBe(1)
      expect(body1.pageSize).toBe(2)

      const page2 = await app.inject({
        method: 'GET',
        url: '/api/groups?page=2&pageSize=2',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(page2.statusCode).toBe(200)
      const body2 = page2.json()
      expect(body2.total).toBe(3)
      expect(body2.data).toHaveLength(1)

      const pageOut = await app.inject({
        method: 'GET',
        url: '/api/groups?page=99&pageSize=2',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(pageOut.statusCode).toBe(200)
      const bodyOut = pageOut.json()
      expect(bodyOut.total).toBe(3)
      expect(bodyOut.data).toHaveLength(0)
    })

    /* The tree is the whole listing, not one page. Ordered from the newest, the
       root is the last row there is — so a page taken alone carries children
       whose parent stayed behind, and a build that trusts one page drops them
       without a word. */
    it('cuts the tree at the page boundary', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const pod5 = await createGroup('POD 5', geben)

      /* The creation order is what this test reads, and `now()` resolves to the
         microsecond with a random uuid as the tiebreaker. The fixture states
         the order instead of racing for it. */
      const createdOn = (id: string, day: number) =>
        app.db
          .updateTable('ticket_groups')
          .set({ created_at: new Date(Date.UTC(2026, 8, day)) })
          .where('id', '=', id)
          .execute()

      await createdOn(geben, 1)
      await createdOn(pod3, 2)
      await createdOn(pod5, 3)

      const response = await app.inject({
        method: 'GET',
        url: '/api/groups?page=1&pageSize=2',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const parents = response.json().data.map((group: { parentId: string }) => group.parentId)
      expect(response.json().total).toBe(3)
      expect(parents).toEqual([geben, geben])
    })

    it('returns 400 for invalid pageSize', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/groups?pageSize=999',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  describe('GET /api/groups/:id', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${NONEXISTENT_ID}`,
      })
      expect(response.statusCode).toBe(401)
    })

    it('returns group by id', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Suporte' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().id).toBe(id)
      expect(response.json().name).toBe('Suporte')
    })

    it('reports the parent of a nested group', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)

      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${pod}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().parentId).toBe(geben)
    })

    it('returns 404 for non-existent group', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${NONEXISTENT_ID}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // ---------------------------------------------------------------------------
  describe('PATCH /api/groups/:id', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${NONEXISTENT_ID}`,
        payload: { name: 'Novo Nome' },
      })
      expect(response.statusCode).toBe(401)
    })

    it('updates group name and refreshes updatedAt', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Antigo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id, updatedAt: updatedAtBefore } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${id}`,
        payload: { name: 'Novo Nome' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.name).toBe('Novo Nome')
      expect(body.updatedBy).toBe(DEV_LOGIN_USER_ID)
      expect(new Date(body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(updatedAtBefore).getTime(),
      )
    })

    it('returns 400 for unknown field (strict schema)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${id}`,
        payload: { name: 'Válido', campoInexistente: 'valor' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 404 for non-existent group', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${NONEXISTENT_ID}`,
        payload: { name: 'Novo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
    })

    it('moves a group to another parent without touching its name', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const subtime = await createGroup('Subtime', geben)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${subtime}`,
        payload: { parentId: pod3 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.parentId).toBe(pod3)
      expect(body.name).toBe('Subtime')
    })

    it('returns 400 for an empty body, which would be an update that updates nothing', async () => {
      const id = await createGroup('Gestão de Benefícios')

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${id}`,
        payload: {},
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('keeps the parent when the update only changes the name', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${pod}`,
        payload: { name: 'POD 5' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.name).toBe('POD 5')
      expect(body.parentId).toBe(geben)
    })
  })

  // ---------------------------------------------------------------------------
  describe('the portfolio and the people a group reads with', () => {
    const addMember = async (groupId: string, userId: string, role?: string): Promise<void> => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId, ...(role !== undefined && { role }) },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(201)
    }

    const carry = (groupId: string, companyId: string): Promise<unknown> =>
      app.db
        .insertInto('ticket_group_companies')
        .values({ group_id: groupId, company_id: companyId })
        .execute()

    const assign = (groupId: string, userId: string, companyId: string): Promise<unknown> =>
      app.db
        .insertInto('ticket_group_member_companies')
        .values({ group_id: groupId, user_id: userId, company_id: companyId })
        .execute()

    it('reads one group with its portfolio and its people', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)
      await addMember(pod, 'larissa@pipo.health', 'admin')
      await addMember(pod, 'ana@pipo.health')
      await carry(pod, COMPANY_A)
      await carry(pod, COMPANY_B)
      await assign(pod, 'ana@pipo.health', COMPANY_A)

      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${pod}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.companyIds).toEqual([COMPANY_A, COMPANY_B])
      expect(body.members).toEqual([
        { userId: 'ana@pipo.health', role: 'member', active: true, companyIds: [COMPANY_A] },
        { userId: 'larissa@pipo.health', role: 'admin', active: true, companyIds: [] },
      ])
    })

    it('reads an empty portfolio and no people as empty lists, not as absent fields', async () => {
      const geben = await createGroup('Gestão de Benefícios')

      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${geben}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.companyIds).toEqual([])
      expect(body.members).toEqual([])
    })

    it('gives the whole sidebar in one listing, each group with its own people', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const pod5 = await createGroup('POD 5', geben)
      await addMember(pod3, 'ana@pipo.health')
      await addMember(pod5, 'bruno@pipo.health')
      await carry(pod3, COMPANY_A)

      const response = await app.inject({
        method: 'GET',
        url: '/api/groups?pageSize=100',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const byId = new Map<string, { companyIds: string[]; members: Array<{ userId: string }> }>(
        response.json().data.map((group: { id: string }) => [group.id, group]),
      )
      expect(byId.get(geben)!.members).toEqual([])
      expect(byId.get(pod3)!.members.map((m) => m.userId)).toEqual(['ana@pipo.health'])
      expect(byId.get(pod5)!.members.map((m) => m.userId)).toEqual(['bruno@pipo.health'])
      expect(byId.get(pod3)!.companyIds).toEqual([COMPANY_A])
      expect(byId.get(pod5)!.companyIds).toEqual([])
    })

    it('leaves an inactive member in the list, flagged, instead of hiding them', async () => {
      const pod = await createGroup('POD 3')
      await addMember(pod, 'ana@pipo.health')
      await app.inject({
        method: 'PATCH',
        url: `/api/groups/${pod}/members/ana@pipo.health`,
        payload: { active: false },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${pod}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.json().members).toEqual([
        { userId: 'ana@pipo.health', role: 'member', active: false, companyIds: [] },
      ])
    })
  })

  // ---------------------------------------------------------------------------
  describe('PUT /api/groups/:id/companies', () => {
    const putCompanies = (groupId: string, companyIds: unknown) =>
      app.inject({
        method: 'PUT',
        url: `/api/groups/${groupId}/companies`,
        payload: { companyIds },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

    const portfolioOf = async (groupId: string): Promise<string[]> => {
      const rows = await app.db
        .selectFrom('ticket_group_companies')
        .select('company_id')
        .where('group_id', '=', groupId)
        .orderBy('company_id')
        .execute()
      return rows.map((row) => row.company_id)
    }

    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/groups/${NONEXISTENT_ID}/companies`,
        payload: { companyIds: [] },
      })

      expect(response.statusCode).toBe(401)
    })

    it('stores the set sent and answers with the group as the read routes see it', async () => {
      const pod = await createGroup('POD 3')

      const response = await putCompanies(pod, [COMPANY_B, COMPANY_A])

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ id: pod, companyIds: [COMPANY_A, COMPANY_B] })
      expect(await portfolioOf(pod)).toEqual([COMPANY_A, COMPANY_B])
    })

    it('drops from the portfolio what the set left out', async () => {
      const pod = await createGroup('POD 3')
      await putCompanies(pod, [COMPANY_A, COMPANY_B])

      const response = await putCompanies(pod, [COMPANY_B])

      expect(response.statusCode).toBe(200)
      expect(await portfolioOf(pod)).toEqual([COMPANY_B])
    })

    it('empties the portfolio with an empty set', async () => {
      const pod = await createGroup('POD 3')
      await putCompanies(pod, [COMPANY_A])

      const response = await putCompanies(pod, [])

      expect(response.statusCode).toBe(200)
      expect(await portfolioOf(pod)).toEqual([])
    })

    it('takes the company away from the person who followed it when the pod drops it', async () => {
      const pod = await createGroup('POD 3')
      await putCompanies(pod, [COMPANY_A, COMPANY_B])
      await app.db
        .insertInto('ticket_group_members')
        .values({ group_id: pod, user_id: 'ana@pipo.health' })
        .execute()
      await app.db
        .insertInto('ticket_group_member_companies')
        .values({ group_id: pod, user_id: 'ana@pipo.health', company_id: COMPANY_A })
        .execute()

      const response = await putCompanies(pod, [COMPANY_B])

      expect(response.json().members).toEqual([
        { userId: 'ana@pipo.health', role: 'member', active: true, companyIds: [] },
      ])
    })

    it('answers 409 naming the group that already carries the company', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const pod5 = await createGroup('POD 5', geben)
      await putCompanies(pod3, [COMPANY_A])

      const response = await putCompanies(pod5, [COMPANY_A])

      expect(response.statusCode).toBe(409)
      expect(response.json().owners).toEqual([
        { companyId: COMPANY_A, groupId: pod3, groupName: 'POD 3' },
      ])
    })

    it('leaves the portfolio as it was when the set is refused', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const pod5 = await createGroup('POD 5', geben)
      await putCompanies(pod3, [COMPANY_A])
      await putCompanies(pod5, [COMPANY_B])

      const response = await putCompanies(pod5, [COMPANY_A])

      expect(response.statusCode).toBe(409)
      expect(await portfolioOf(pod5)).toEqual([COMPANY_B])
      expect(await portfolioOf(pod3)).toEqual([COMPANY_A])
    })

    it('lets only one of two pods take the same company at the same time', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const pod5 = await createGroup('POD 5', geben)

      const responses = await Promise.all([
        putCompanies(pod3, [COMPANY_A]),
        putCompanies(pod5, [COMPANY_A]),
      ])

      expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409])
    })

    it('never answers 500 when two pods claim the same companies in opposite order', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const pod5 = await createGroup('POD 5', geben)

      for (let round = 0; round < 50; round += 1) {
        const responses = await Promise.all([
          putCompanies(pod3, [COMPANY_A, COMPANY_B]),
          putCompanies(pod5, [COMPANY_B, COMPANY_A]),
        ])
        expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409])
        await app.db.deleteFrom('ticket_group_companies').execute()
      }
    })

    it('never answers 500 when a pod drops a company while another claims it', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const pod5 = await createGroup('POD 5', geben)

      for (let round = 0; round < 10; round += 1) {
        await putCompanies(pod3, [COMPANY_A])
        const responses = await Promise.all([
          putCompanies(pod3, [COMPANY_B]),
          putCompanies(pod5, [COMPANY_B, COMPANY_A]),
        ])
        expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409])
        await app.db.deleteFrom('ticket_group_companies').execute()
      }
    })

    it('returns 404 for non-existent group', async () => {
      const response = await putCompanies(NONEXISTENT_ID, [COMPANY_A])

      expect(response.statusCode).toBe(404)
    })

    it('returns 400 when the set repeats a company', async () => {
      const pod = await createGroup('POD 3')

      const response = await putCompanies(pod, [COMPANY_A, COMPANY_A])

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when a company id is not a uuid', async () => {
      const pod = await createGroup('POD 3')

      const response = await putCompanies(pod, ['acme'])

      expect(response.statusCode).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  describe('POST /api/groups/:id/companies/:companyId', () => {
    const carry = (groupId: string, companyId: string) =>
      app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/companies/${companyId}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${NONEXISTENT_ID}/companies/${COMPANY_A}`,
      })

      expect(response.statusCode).toBe(401)
    })

    it('adds one company and keeps the rest of the portfolio', async () => {
      const pod = await createGroup('POD 3')
      await carry(pod, COMPANY_A)

      const response = await carry(pod, COMPANY_B)

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ id: pod, companyIds: [COMPANY_A, COMPANY_B] })
    })

    it('answers the same portfolio when the pod already carries the company', async () => {
      const pod = await createGroup('POD 3')
      await carry(pod, COMPANY_A)

      const response = await carry(pod, COMPANY_A)

      expect(response.statusCode).toBe(200)
      expect(response.json().companyIds).toEqual([COMPANY_A])
    })

    it('answers 409 naming the group that already carries the company', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const pod5 = await createGroup('POD 5', geben)
      await carry(pod3, COMPANY_A)

      const response = await carry(pod5, COMPANY_A)

      expect(response.statusCode).toBe(409)
      expect(response.json().owners).toEqual([
        { companyId: COMPANY_A, groupId: pod3, groupName: 'POD 3' },
      ])
    })

    it('returns 404 for non-existent group', async () => {
      const response = await carry(NONEXISTENT_ID, COMPANY_A)

      expect(response.statusCode).toBe(404)
    })

    it('returns 400 when the company id is not a uuid', async () => {
      const pod = await createGroup('POD 3')

      const response = await carry(pod, 'acme')

      expect(response.statusCode).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  describe('carrying a company takes its open tickets along', () => {
    const insertTicket = async (
      groupId: string,
      companyId: string,
      closedAt: Date | null = null,
    ): Promise<string> => {
      const row = await app.db
        .insertInto('tickets')
        .values({
          enrollment_id: randomUUID(),
          enrollment_type: 'inclusion',
          company_id: companyId,
          source_system: 'enrollment-integrations',
          status: closedAt ? 'completed' : 'broker-processing',
          group_id: groupId,
          closed_at: closedAt,
          enrollment_snapshot: JSON.stringify({}),
          tags: [],
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      return row.id
    }

    const groupOf = async (ticketId: string): Promise<string> => {
      const row = await app.db
        .selectFrom('tickets')
        .select('group_id')
        .where('id', '=', ticketId)
        .executeTakeFirstOrThrow()
      return row.group_id
    }

    const movedEventsOf = (ticketId: string) =>
      app.db
        .selectFrom('ticket_comments')
        .select(['author_id', 'author_type', 'metadata'])
        .where('ticket_id', '=', ticketId)
        .where('event_type', '=', 'moved')
        .execute()

    const carry = (groupId: string, companyId: string) =>
      app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/companies/${companyId}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

    const putCompanies = (groupId: string, companyIds: string[]) =>
      app.inject({
        method: 'PUT',
        url: `/api/groups/${groupId}/companies`,
        payload: { companyIds },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

    it('moves the open tickets of the company from the root into the pod on POST', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)
      const first = await insertTicket(geben, COMPANY_A)
      const second = await insertTicket(geben, COMPANY_A)

      const response = await carry(pod, COMPANY_A)

      expect(response.statusCode).toBe(200)
      expect(await groupOf(first)).toBe(pod)
      expect(await groupOf(second)).toBe(pod)
    })

    it('leaves a closed ticket of the company in the group where it closed', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)
      const closed = await insertTicket(geben, COMPANY_A, new Date('2026-09-01T12:00:00Z'))

      await carry(pod, COMPANY_A)

      expect(await groupOf(closed)).toBe(geben)
      expect(await movedEventsOf(closed)).toEqual([])
    })

    it('leaves the tickets of other companies where they are', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)
      const other = await insertTicket(geben, COMPANY_B)

      await carry(pod, COMPANY_A)

      expect(await groupOf(other)).toBe(geben)
    })

    it('records one moved event per ticket, signed by who carried the company', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)
      const ticket = await insertTicket(geben, COMPANY_A)

      await carry(pod, COMPANY_A)

      expect(await movedEventsOf(ticket)).toEqual([
        {
          author_id: DEV_LOGIN_USER_ID,
          author_type: 'user',
          metadata: { groupId: pod, previous: geben },
        },
      ])
    })

    it('records no second event when the pod already carries the company', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)
      const ticket = await insertTicket(geben, COMPANY_A)
      await carry(pod, COMPANY_A)

      await carry(pod, COMPANY_A)

      expect(await movedEventsOf(ticket)).toHaveLength(1)
    })

    it('moves the open tickets of the companies a PUT adds', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)
      const first = await insertTicket(geben, COMPANY_A)
      const second = await insertTicket(geben, COMPANY_B)

      const response = await putCompanies(pod, [COMPANY_A, COMPANY_B])

      expect(response.statusCode).toBe(200)
      expect(await groupOf(first)).toBe(pod)
      expect(await groupOf(second)).toBe(pod)
      expect(await movedEventsOf(second)).toHaveLength(1)
    })

    it('leaves a ticket escalated to the root there when a PUT resends the portfolio', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)
      await putCompanies(pod, [COMPANY_A])
      const escalated = await insertTicket(geben, COMPANY_A)

      await putCompanies(pod, [COMPANY_A, COMPANY_B])

      expect(await groupOf(escalated)).toBe(geben)
    })

    it('moves nothing when the company is carried by another pod', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const pod5 = await createGroup('POD 5', geben)
      await carry(pod3, COMPANY_A)
      const ticket = await insertTicket(pod3, COMPANY_A)

      const response = await carry(pod5, COMPANY_A)

      expect(response.statusCode).toBe(409)
      expect(await groupOf(ticket)).toBe(pod3)
    })
  })

  // ---------------------------------------------------------------------------
  describe('the shape of the hierarchy', () => {
    /* `code` is what the web switches the pt-BR copy on, so it is asserted
       here too: a rename that only the message notices is a silent break. */
    const refusalOf = (response: {
      json: () => { details?: Array<{ field: string; code: string }> }
    }): Array<{ field: string; code: string }> =>
      (response.json().details ?? []).map(({ field, code }) => ({ field, code }))

    it('refuses a second root, because the tree has one GEBEN', async () => {
      await createGroup('Gestão de Benefícios')

      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Outra raiz' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)
      expect(refusalOf(response)).toEqual([{ field: 'parentId', code: 'root_already_exists' }])
    })

    it('refuses a parent that does not exist', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'POD 3', parentId: NONEXISTENT_ID },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)
      expect(refusalOf(response)).toEqual([{ field: 'parentId', code: 'parent_not_found' }])
    })

    it('refuses a group that is its own parent', async () => {
      const geben = await createGroup('Gestão de Benefícios')

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${geben}`,
        payload: { parentId: geben },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)
      expect(refusalOf(response)).toEqual([{ field: 'parentId', code: 'parent_is_descendant' }])
    })

    it('refuses a parent that is a descendant, which would close a cycle', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${geben}`,
        payload: { parentId: pod },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)
      expect(refusalOf(response)).toEqual([{ field: 'parentId', code: 'parent_is_descendant' }])
    })

    it('accepts a subtime, which is the third and last level', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)

      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Subtime', parentId: pod },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
    })

    it('refuses a fourth level', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)
      const subtime = await createGroup('Subtime', pod)

      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Fundo do poço', parentId: subtime },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)
      expect(refusalOf(response)).toEqual([{ field: 'parentId', code: 'max_depth_exceeded' }])
    })

    it('refuses a move that pushes the children of the moved group past the limit', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod3 = await createGroup('POD 3', geben)
      const pod5 = await createGroup('POD 5', geben)
      await createGroup('Subtime', pod3)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${pod3}`,
        payload: { parentId: pod5 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)
      expect(refusalOf(response)).toEqual([{ field: 'parentId', code: 'max_depth_exceeded' }])
    })

    it('refuses to detach a pod while the root is another group', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${pod}`,
        payload: { parentId: null },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(422)
      expect(refusalOf(response)).toEqual([{ field: 'parentId', code: 'root_already_exists' }])
    })

    it('accepts detaching the group that already is the root', async () => {
      const geben = await createGroup('Gestão de Benefícios')

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${geben}`,
        payload: { parentId: null },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().parentId).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  describe('two writes arriving together', () => {
    const post = (payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/api/groups',
        payload,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

    const codesOf = (responses: Array<{ statusCode: number }>): number[] =>
      responses.map((r) => r.statusCode).sort((a, b) => a - b)

    it('lets only one of two simultaneous roots through', async () => {
      const responses = await Promise.all([post({ name: 'Raiz A' }), post({ name: 'Raiz B' })])

      expect(codesOf(responses)).toEqual([201, 422])
    })

    it('refuses the move that would close a cycle, even simultaneously', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const podA = await createGroup('POD A', geben)
      const podB = await createGroup('POD B', geben)

      const move = (id: string, parentId: string) =>
        app.inject({
          method: 'PATCH',
          url: `/api/groups/${id}`,
          payload: { parentId },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })

      const responses = await Promise.all([move(podA, podB), move(podB, podA)])

      expect(codesOf(responses)).toEqual([200, 422])
    })

    it('never answers 500 when a parent is deleted while a child is created', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      const pod = await createGroup('POD 3', geben)

      const responses = await Promise.all([
        post({ name: 'Subtime', parentId: pod }),
        app.inject({
          method: 'DELETE',
          url: `/api/groups/${pod}`,
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        }),
      ])

      // Either order is correct; what must not happen is the FK reaching the client.
      expect([[201, 409].toString(), [204, 422].toString()]).toContain(
        codesOf(responses).toString(),
      )
    })
  })

  // ---------------------------------------------------------------------------
  describe('DELETE /api/groups/:id', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${NONEXISTENT_ID}`,
      })
      expect(response.statusCode).toBe(401)
    })

    it('deletes group and returns 204', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Para Deletar' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(deleteResponse.statusCode).toBe(204)

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/groups/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(getResponse.statusCode).toBe(404)
    })

    it('returns 404 for non-existent group', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${NONEXISTENT_ID}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
    })

    it('returns 409 when group still has members', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Com Membros' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id } = created.json()

      await app.inject({
        method: 'POST',
        url: `/api/groups/${id}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${id}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().message).toContain('members')
    })

    it('says it is the child group that blocks the delete', async () => {
      const geben = await createGroup('Gestão de Benefícios')
      await createGroup('POD 3', geben)

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${geben}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().message).toContain('child groups')
    })

    it('says it is the portfolio that blocks the delete', async () => {
      const pod = await createGroup('POD 3')
      await app.db
        .insertInto('ticket_group_companies')
        .values({ group_id: pod, company_id: COMPANY_A })
        .execute()

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${pod}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().message).toContain('companies')
    })

    it('says it is the saved view that blocks the delete', async () => {
      const pod = await createGroup('POD 3')
      await app.db
        .insertInto('ticket_queues')
        .values({ name: 'MOV CLT', created_by: 'test', group_id: pod })
        .execute()

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${pod}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().message).toContain('saved views')
    })

    it('says it is the ticket that blocks the delete', async () => {
      const pod = await createGroup('POD 3')
      await app.db
        .insertInto('tickets')
        .values({
          status: 'open',
          enrollment_id: COMPANY_A,
          enrollment_type: 'inclusion',
          company_id: COMPANY_A,
          source_system: 'test',
          group_id: pod,
        })
        .execute()

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${pod}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().message).toContain('tickets')
    })
  })

  // ---------------------------------------------------------------------------
  describe('POST /api/groups/:id/members', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${NONEXISTENT_ID}/members`,
        payload: { userId: USER_ID_1 },
      })
      expect(response.statusCode).toBe(401)
    })

    it('adds a member to a group and returns 201', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.groupId).toBe(groupId)
      expect(body.userId).toBe(USER_ID_1)
      expect(body.active).toBe(true)
    })

    it('gives a new member the role of member, which is the analyst of the pod', async () => {
      const groupId = await createGroup('POD 3')

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().role).toBe('member')
    })

    it('adds a member as admin, which is the coordination of the pod', async () => {
      const groupId = await createGroup('POD 3')

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1, role: 'admin' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().role).toBe('admin')
    })

    it('returns 400 for a role outside admin and member', async () => {
      const groupId = await createGroup('POD 3')

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1, role: 'coordenacao' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 409 when adding duplicate member', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(409)
    })

    it('returns 404 for non-existent group', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${NONEXISTENT_ID}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
    })

    it('accepts an e-mail as userId, the way the rest of the system identifies people', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: 'ana@pipo.health' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().userId).toBe('ana@pipo.health')
    })

    it('returns 400 for an empty userId', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: '' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for a whitespace-only userId', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: '   ' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 for a userId longer than 255 characters', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: 'a'.repeat(256) },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  // ---------------------------------------------------------------------------
  describe('DELETE /api/groups/:id/members/:memberId', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${NONEXISTENT_ID}/members/${USER_ID_1}`,
      })
      expect(response.statusCode).toBe(401)
    })

    it('removes a member and returns 204', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}/members/${USER_ID_1}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(204)
    })

    it('returns 404 when member does not exist', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}/members/${USER_ID_1}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
    })

    /** Two forms because both are correct: `@` is legal raw in a path segment,
     *  and a client that percent-encodes it must reach the same member. */
    it.each([
      ['raw', (email: string) => email],
      ['percent-encoded', (email: string) => encodeURIComponent(email)],
    ])('removes a member whose id is an e-mail, %s in the path', async (_form, encode) => {
      const email = 'ana@pipo.health'
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()
      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: email },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}/members/${encode(email)}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(204)
    })

    /** The router's default `maxParamLength` of 100 answered 414 here, for a
     *  member the POST had just accepted. */
    it('removes a member whose id is 255 characters long, the most the POST accepts', async () => {
      const longId = 'a'.repeat(255)
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()
      const added = await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: longId },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(added.statusCode).toBe(201)

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/groups/${groupId}/members/${longId}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(204)
    })
  })

  // ---------------------------------------------------------------------------
  describe('PATCH /api/groups/:id/members/:memberId', () => {
    it('returns 401 without session cookie', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${NONEXISTENT_ID}/members/${USER_ID_1}`,
        payload: { active: false },
      })
      expect(response.statusCode).toBe(401)
    })

    it('updates member active status', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${groupId}/members/${USER_ID_1}`,
        payload: { active: false },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().active).toBe(false)
      expect(response.json().userId).toBe(USER_ID_1)
    })

    it('returns 400 for unknown field (strict schema)', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${groupId}/members/${USER_ID_1}`,
        payload: { active: false, campoInexistente: 'valor' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })

    it('returns 404 when member does not exist', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Grupo' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      const { id: groupId } = created.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${groupId}/members/${USER_ID_1}`,
        payload: { active: false },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(404)
    })

    it('promotes a member to admin without touching the active flag', async () => {
      const groupId = await createGroup('POD 3')
      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${groupId}/members/${USER_ID_1}`,
        payload: { role: 'admin' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.role).toBe('admin')
      expect(body.active).toBe(true)
    })

    it('returns 400 for an empty body, which would be an update that updates nothing', async () => {
      const groupId = await createGroup('POD 3')
      await app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload: { userId: USER_ID_1 },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/groups/${groupId}/members/${USER_ID_1}`,
        payload: {},
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('the slice of the portfolio a person follows', () => {
    const ANA = 'ana@pipo.health'

    const podCarrying = async (...companyIds: string[]): Promise<string> => {
      const pod = await createGroup('POD 3')
      const response = await app.inject({
        method: 'PUT',
        url: `/api/groups/${pod}/companies`,
        payload: { companyIds },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(response.statusCode).toBe(200)
      return pod
    }

    const addMember = (groupId: string, payload: object) =>
      app.inject({
        method: 'POST',
        url: `/api/groups/${groupId}/members`,
        payload,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

    const updateMember = (groupId: string, payload: object) =>
      app.inject({
        method: 'PATCH',
        url: `/api/groups/${groupId}/members/${ANA}`,
        payload,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

    const sliceOf = async (groupId: string): Promise<string[] | undefined> => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/groups/${groupId}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      return response.json().members.find((m: { userId: string }) => m.userId === ANA)?.companyIds
    }

    it('adds a person already following part of the portfolio', async () => {
      const pod = await podCarrying(COMPANY_A, COMPANY_B)

      const response = await addMember(pod, { userId: ANA, companyIds: [COMPANY_B] })

      expect(response.statusCode).toBe(201)
      expect(response.json().companyIds).toEqual([COMPANY_B])
      expect(await sliceOf(pod)).toEqual([COMPANY_B])
    })

    it('adds a person with an empty slice when the body leaves it out', async () => {
      const pod = await podCarrying(COMPANY_A)

      const response = await addMember(pod, { userId: ANA })

      expect(response.json().companyIds).toEqual([])
    })

    it('answers 422 on companyIds when the slice leaves the portfolio, and adds no one', async () => {
      const pod = await podCarrying(COMPANY_A)

      const response = await addMember(pod, { userId: ANA, companyIds: [COMPANY_A, COMPANY_B] })

      expect(response.statusCode).toBe(422)
      expect(response.json().details).toEqual([
        {
          field: 'companyIds',
          message: expect.stringContaining(COMPANY_B),
          code: 'not_in_portfolio',
        },
      ])
      expect(response.json().message).not.toContain(COMPANY_A)
      expect(await sliceOf(pod)).toBeUndefined()
    })

    it('returns 400 when the slice repeats a company', async () => {
      const pod = await podCarrying(COMPANY_A)

      const response = await addMember(pod, { userId: ANA, companyIds: [COMPANY_A, COMPANY_A] })

      expect(response.statusCode).toBe(400)
    })

    it('returns 400 when the slice repeats a company in another case', async () => {
      const pod = await podCarrying(COMPANY_A)

      const response = await addMember(pod, {
        userId: ANA,
        companyIds: [COMPANY_A, COMPANY_A.toUpperCase()],
      })

      expect(response.statusCode).toBe(400)
    })

    it('matches the slice against the portfolio by value, whatever the case sent', async () => {
      const pod = await podCarrying(COMPANY_A)

      const response = await addMember(pod, { userId: ANA, companyIds: [COMPANY_A.toUpperCase()] })

      expect(response.statusCode).toBe(201)
      expect(response.json().companyIds).toEqual([COMPANY_A])
    })

    it('answers the slice in the order the read routes use, whatever the order sent', async () => {
      const pod = await podCarrying(COMPANY_A, COMPANY_B)
      await addMember(pod, { userId: ANA })

      const response = await updateMember(pod, { companyIds: [COMPANY_B, COMPANY_A] })

      expect(response.json().companyIds).toEqual([COMPANY_A, COMPANY_B])
      expect(await sliceOf(pod)).toEqual([COMPANY_A, COMPANY_B])
    })

    it('replaces the slice with the set sent', async () => {
      const pod = await podCarrying(COMPANY_A, COMPANY_B)
      await addMember(pod, { userId: ANA, companyIds: [COMPANY_A] })

      const response = await updateMember(pod, { companyIds: [COMPANY_B] })

      expect(response.statusCode).toBe(200)
      expect(response.json().companyIds).toEqual([COMPANY_B])
      expect(await sliceOf(pod)).toEqual([COMPANY_B])
    })

    it('keeps the slice when the update only changes the role', async () => {
      const pod = await podCarrying(COMPANY_A)
      await addMember(pod, { userId: ANA, companyIds: [COMPANY_A] })

      const response = await updateMember(pod, { role: 'admin' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ role: 'admin', companyIds: [COMPANY_A] })
    })

    it('answers 422 on companyIds when the new slice leaves the portfolio, and keeps the old one', async () => {
      const pod = await podCarrying(COMPANY_A)
      await addMember(pod, { userId: ANA, companyIds: [COMPANY_A] })

      const response = await updateMember(pod, { role: 'admin', companyIds: [COMPANY_B] })

      expect(response.statusCode).toBe(422)
      expect(response.json().details[0]).toMatchObject({
        field: 'companyIds',
        code: 'not_in_portfolio',
      })
      expect(await sliceOf(pod)).toEqual([COMPANY_A])
      const detail = await app.inject({
        method: 'GET',
        url: `/api/groups/${pod}`,
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      expect(detail.json().members[0].role).toBe('member')
    })

    it('never merges two slices sent at the same time', async () => {
      const COMPANY_C = '00000000-0000-4000-8000-00000000000c'
      const pod = await podCarrying(COMPANY_A, COMPANY_B, COMPANY_C)
      await addMember(pod, { userId: ANA, companyIds: [COMPANY_C] })

      for (let round = 0; round < 10; round += 1) {
        await Promise.all([
          updateMember(pod, { companyIds: [COMPANY_A] }),
          updateMember(pod, { companyIds: [COMPANY_B] }),
        ])
        expect([[COMPANY_A], [COMPANY_B]]).toContainEqual(await sliceOf(pod))
      }
    })

    it('names only the companies that left when the portfolio shrinks during the write', async () => {
      const COMPANY_C = '00000000-0000-4000-8000-00000000000c'
      const pod = await podCarrying(COMPANY_A, COMPANY_B)
      await addMember(pod, { userId: ANA })

      for (let round = 0; round < 10; round += 1) {
        const [slice] = await Promise.all([
          updateMember(pod, { companyIds: [COMPANY_A, COMPANY_B] }),
          app.inject({
            method: 'PUT',
            url: `/api/groups/${pod}/companies`,
            payload: { companyIds: [COMPANY_B, COMPANY_C] },
            cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
          }),
        ])
        if (slice.statusCode === 422) expect(slice.json().message).not.toContain(COMPANY_B)
        else expect(slice.statusCode).toBe(200)
        await app.db
          .insertInto('ticket_group_companies')
          .values({ group_id: pod, company_id: COMPANY_A })
          .onConflict((oc) => oc.column('company_id').doNothing())
          .execute()
      }
    })

    it('returns 404 when the person is not a member of the group', async () => {
      const pod = await podCarrying(COMPANY_A)

      const response = await updateMember(pod, { companyIds: [COMPANY_A] })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('the structure policy', () => {
    let withoutPolicy: string
    let withTicketPolicy: string
    let withWholeProduct: string

    beforeAll(async () => {
      const anonymous = await app.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        payload: { policies: [] },
      })
      withoutPolicy = cookieValue(anonymous, SESSION_COOKIE_NAME)!

      const ticketOnly = await app.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        payload: { policies: ['admin/allow/administrate/pipodesk/ticket'] },
      })
      withTicketPolicy = cookieValue(ticketOnly, SESSION_COOKIE_NAME)!

      const wholeProduct = await app.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        payload: { policies: ['admin/allow/administrate/pipodesk/*'] },
      })
      withWholeProduct = cookieValue(wholeProduct, SESSION_COOKIE_NAME)!
    })

    const routes: Array<[string, string]> = [
      ['GET', '/api/groups'],
      ['POST', '/api/groups'],
      ['GET', '/api/groups/:id'],
      ['PATCH', '/api/groups/:id'],
      ['PUT', '/api/groups/:id/companies'],
      ['POST', '/api/groups/:id/companies/:companyId'],
      ['DELETE', '/api/groups/:id'],
      ['POST', '/api/groups/:id/members'],
      ['PATCH', '/api/groups/:id/members/:memberId'],
      ['DELETE', '/api/groups/:id/members/:memberId'],
    ]

    // Ids that do not exist are enough: the policy closes before the lookup.
    it.each(routes)('answers 403 on %s %s for a session with no policy', async (method, url) => {
      const response = await app.inject({
        method: method as 'GET',
        url: url
          .replace(':id', NONEXISTENT_ID)
          .replace(':memberId', USER_ID_1)
          .replace(':companyId', COMPANY_A),
        cookies: { [SESSION_COOKIE_NAME]: withoutPolicy },
        payload: method === 'GET' || method === 'DELETE' ? undefined : { name: 'Grupo' },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error).toBe('ForbiddenError')
    })

    // The wildcard only ever matches on the session side (see policy.test.ts).
    it('opens the route for a session holding the whole product', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/groups',
        cookies: { [SESSION_COOKIE_NAME]: withWholeProduct },
      })

      expect(response.statusCode).toBe(200)
    })

    it('answers 403 for a session holding only the ticket policy', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/groups',
        cookies: { [SESSION_COOKIE_NAME]: withTicketPolicy },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
