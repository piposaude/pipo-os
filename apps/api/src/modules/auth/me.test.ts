import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from './session.js'
import { usersPage } from '../../shared/json.test-helpers.js'

const VIEWER = 'dev@piposaude.com.br'
const STRUCTURE = 'admin/allow/administrate/pipodesk/structure'

describe('GET /api/auth/me — the rich session', () => {
  let app: FastifyInstance
  let sessionCookie: string
  let poolDestroyed = false
  const fetchMock = vi.fn()

  beforeEach(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    poolDestroyed = false
    vi.stubEnv('SERVICE_ACCOUNT_TOKEN', 'token-for-tests')
    fetchMock.mockReset()
    fetchMock.mockImplementation(() => usersPage([{ email: VIEWER, name: 'Dev da Silva' }]))
    vi.stubGlobal('fetch', fetchMock)

    app = buildApp()
    await app.ready()

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies: [STRUCTURE] },
    })
    sessionCookie = login.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)!.value
  })

  afterEach(async () => {
    // Only the test that destroys the pool skips this: swallowing the error
    // for every test would hide a real cleanup failure.
    if (!poolDestroyed) {
      await app.db.deleteFrom('ticket_group_members').execute()
      await app.db.deleteFrom('ticket_groups').execute()
    }
    await app.close()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    delete process.env.DEV_LOGIN_ENABLED
  })

  const me = async () =>
    app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })

  const createGroup = async (name: string): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/groups',
      payload: { name },
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })
    return response.json().id as string
  }

  const addMember = async (groupId: string, userId: string, role?: string): Promise<void> => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/groups/${groupId}/members`,
      payload: { userId, ...(role !== undefined && { role }) },
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })
    expect(response.statusCode).toBe(201)
  }

  it('says who the viewer is by the sub the author columns store', async () => {
    const response = await me()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ sub: VIEWER, email: VIEWER })
  })

  it('names the viewer from the pipo user list', async () => {
    expect((await me()).json().name).toBe('Dev da Silva')
  })

  it('answers without a name, not with an error, when the auth-service is down', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    const response = await me()

    expect(response.statusCode).toBe(200)
    expect(response.json().name).toBeNull()
  })

  it('answers without a name when the viewer is in no user list', async () => {
    fetchMock.mockImplementation(() =>
      usersPage([{ email: 'someone.else@piposaude.com.br', name: 'Someone Else' }]),
    )

    expect((await me()).json().name).toBeNull()
  })

  it('lists the pods the viewer belongs to, with the role that separates coordination', async () => {
    const pod = await createGroup('POD 1')
    await addMember(pod, VIEWER, 'admin')

    expect((await me()).json().groups).toEqual([{ groupId: pod, role: 'admin' }])
  })

  it('leaves out a membership that was deactivated', async () => {
    const pod = await createGroup('POD 1')
    await addMember(pod, VIEWER)
    await app.inject({
      method: 'PATCH',
      url: `/api/groups/${pod}/members/${VIEWER}`,
      payload: { active: false },
      cookies: { [SESSION_COOKIE_NAME]: sessionCookie },
    })

    expect((await me()).json().groups).toEqual([])
  })

  // requireUserId refuses a write with no sub; reading the session must not
  // break on it, nor invent an owner for the pods.
  it('answers a session with no sub, with no pods and no id', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({
        email: VIEWER,
        exp: Math.floor(Date.now() / 1000) + 3600,
        policies: [STRUCTURE],
      }),
    ).toString('base64url')
    const signed = app.signCookie(`${header}.${payload}.not-a-signature`)

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { [SESSION_COOKIE_NAME]: signed },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ sub: null, email: VIEWER, groups: [] })
  })

  it('keeps the session, with the pods unknown, when the database is gone', async () => {
    await app.db.destroy()
    poolDestroyed = true

    const response = await me()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ email: VIEWER, groups: null })
  })

  it('leaves out the pods of everyone else', async () => {
    const pod = await createGroup('POD 1')
    await addMember(pod, 'outra.pessoa@piposaude.com.br')

    expect((await me()).json().groups).toEqual([])
  })
})
