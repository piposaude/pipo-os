import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../app.js'
import { authConfig } from './config.js'
import { SESSION_COOKIE_NAME } from './session.js'

// These tests are the enforcement of the dev-login safety contract: the route
// must be unreachable unless explicitly opted in, and the app must refuse to
// boot if the opt-in ever reaches a deployed environment.
describe('dev login', () => {
  const originalEnv = { ...process.env }
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
    process.env = { ...originalEnv }
  })

  async function buildWith(env: Record<string, string | undefined>): Promise<FastifyInstance> {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    const instance = buildApp()
    await instance.ready()
    app = instance
    return instance
  }

  describe('when disabled', () => {
    it('does not register the route at all', async () => {
      const instance = await buildWith({ DEV_LOGIN_ENABLED: undefined })

      const response = await instance.inject({ method: 'POST', url: '/api/auth/dev-login' })

      expect(response.statusCode).toBe(404)
    })

    it('stays disabled when the flag is set to anything other than "true"', async () => {
      const instance = await buildWith({ DEV_LOGIN_ENABLED: '1' })

      const response = await instance.inject({ method: 'POST', url: '/api/auth/dev-login' })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('boot-time refusal', () => {
    it('throws when enabled with NODE_ENV=production', () => {
      process.env.DEV_LOGIN_ENABLED = 'true'
      process.env.NODE_ENV = 'production'

      expect(() => authConfig()).toThrow(/never be set in a deployed environment/)
    })

    it('throws when enabled with APP_ENV=stag', () => {
      process.env.DEV_LOGIN_ENABLED = 'true'
      process.env.NODE_ENV = 'development'
      process.env.APP_ENV = 'stag'

      expect(() => authConfig()).toThrow(/never be set in a deployed environment/)
    })

    it('throws when enabled with APP_ENV=prod', () => {
      process.env.DEV_LOGIN_ENABLED = 'true'
      process.env.NODE_ENV = 'development'
      process.env.APP_ENV = 'prod'

      expect(() => authConfig()).toThrow(/never be set in a deployed environment/)
    })

    it('throws when DEV_LOGIN_EMAIL is outside the allowed domains', () => {
      process.env.DEV_LOGIN_ENABLED = 'true'
      process.env.NODE_ENV = 'development'
      delete process.env.APP_ENV
      process.env.DEV_LOGIN_EMAIL = 'someone@gmail.com'

      expect(() => authConfig()).toThrow(/must belong to one of ALLOWED_EMAIL_DOMAINS/)
    })
  })

  describe('when enabled locally', () => {
    const enabledEnv = {
      DEV_LOGIN_ENABLED: 'true',
      NODE_ENV: 'test',
      APP_ENV: undefined,
      DEV_LOGIN_EMAIL: undefined,
    }

    it('mints a session cookie that /api/auth/me accepts', async () => {
      const instance = await buildWith(enabledEnv)

      const login = await instance.inject({ method: 'POST', url: '/api/auth/dev-login' })

      expect(login.statusCode).toBe(204)
      const sessionCookie = login.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)
      expect(sessionCookie).toBeDefined()

      const me = await instance.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie!.value },
      })

      expect(me.statusCode).toBe(200)
      expect(me.json()).toEqual({ email: 'dev@piposaude.com.br', policies: [] })
    })

    it('applies the policies given in the body', async () => {
      const instance = await buildWith(enabledEnv)

      const login = await instance.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        payload: { policies: ['admin/allow/administrate/ticket/*'] },
      })
      const sessionCookie = login.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)!

      const me = await instance.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie.value },
      })

      expect(me.json().policies).toEqual(['admin/allow/administrate/ticket/*'])
    })

    it('honours DEV_LOGIN_EMAIL', async () => {
      const instance = await buildWith({ ...enabledEnv, DEV_LOGIN_EMAIL: 'pikachu@pipo.ai' })

      const login = await instance.inject({ method: 'POST', url: '/api/auth/dev-login' })
      const sessionCookie = login.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)!

      const me = await instance.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: { [SESSION_COOKIE_NAME]: sessionCookie.value },
      })

      expect(me.json().email).toBe('pikachu@pipo.ai')
    })

    it('rejects requests that do not come from loopback', async () => {
      const instance = await buildWith(enabledEnv)

      const response = await instance.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        remoteAddress: '10.0.0.7',
      })

      expect(response.statusCode).toBe(404)
      expect(response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)).toBeUndefined()
    })

    it('ignores a forged X-Forwarded-For header (trustProxy is off)', async () => {
      const instance = await buildWith(enabledEnv)

      const response = await instance.inject({
        method: 'POST',
        url: '/api/auth/dev-login',
        remoteAddress: '10.0.0.7',
        headers: { 'x-forwarded-for': '127.0.0.1' },
      })

      expect(response.statusCode).toBe(404)
    })

    it('stays out of the published OpenAPI contract', async () => {
      const instance = await buildWith(enabledEnv)

      const spec = instance.swagger() as { paths?: Record<string, unknown> }

      expect(Object.keys(spec.paths ?? {})).not.toContain('/api/auth/dev-login')
    })
  })
})
