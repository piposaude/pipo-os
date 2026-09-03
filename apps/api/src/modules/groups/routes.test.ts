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
      payload: { policies: [] },
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
    await app.db.deleteFrom('ticket_group_member_companies').execute()
    await app.db.deleteFrom('ticket_group_companies').execute()
    await app.db.deleteFrom('ticket_group_members').execute()
    await app.db.deleteFrom('ticket_groups').execute()
  })

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
      await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Alpha' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Beta' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

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
      await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Operações Dental' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })
      await app.inject({
        method: 'POST',
        url: '/api/groups',
        payload: { name: 'Suporte Médico' },
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
      })

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
      for (let i = 1; i <= 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/groups',
          payload: { name: `Grupo ${i}` },
          cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
        })
      }

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
  })
})
