import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../app.js'
import { SESSION_COOKIE_NAME } from '../auth/session.js'
import { jsonResponse } from '../../shared/json.test-helpers.js'

const SUBDEMO = 'ed635b72-77d2-41f9-9b2a-2ceb55c19b52'
const UNKNOWN = '00000000-0000-4000-8000-000000000000'
const TICKET = 'admin/allow/administrate/pipodesk/ticket'
const STRUCTURE = 'admin/allow/administrate/pipodesk/structure'

describe('companies routes', () => {
  let app: FastifyInstance
  const fetchMock = vi.fn()

  beforeEach(async () => {
    process.env.DEV_LOGIN_ENABLED = 'true'
    vi.stubEnv('SERVICE_ACCOUNT_TOKEN', 'token-for-tests')
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)

    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    delete process.env.DEV_LOGIN_ENABLED
  })

  const getCompanies = async (policies: string[], query = '') => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/dev-login',
      payload: { policies },
    })
    const cookie = login.cookies.find((c) => c.name === SESSION_COOKIE_NAME)!.value

    return app.inject({
      method: 'GET',
      url: `/api/companies${query}`,
      cookies: { [SESSION_COOKIE_NAME]: cookie },
    })
  }

  const companyServiceCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/companies'))

  it('returns 401 without a session', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/companies?ids=${SUBDEMO}` })

    expect(response.statusCode).toBe(401)
  })

  it('returns 403 for a session that carries no Pipodesk policy', async () => {
    const response = await getCompanies(['admin/allow/administrate/company/*'], `?ids=${SUBDEMO}`)

    expect(response.statusCode).toBe(403)
    expect(companyServiceCalls()).toHaveLength(0)
  })

  it.each([TICKET, STRUCTURE])('answers a session holding %s', async (policy) => {
    fetchMock.mockImplementation(() =>
      jsonResponse({ companies: [{ id: SUBDEMO, 'tax-id': '32454452000130', name: 'SubDemo25' }] }),
    )

    const response = await getCompanies([policy], `?ids=${SUBDEMO}&ids=${UNKNOWN}`)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [{ id: SUBDEMO, name: 'SubDemo25', taxId: '32454452000130' }],
    })
    expect(companyServiceCalls()[0][0]).toBe(
      `http://company-service.default:4000/api/companies?ids=${SUBDEMO},${UNKNOWN}`,
    )
  })

  it('asks the company-service once per id, whatever the case or the repetition', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ companies: [] }))

    await getCompanies([TICKET], `?ids=${SUBDEMO.toUpperCase()}&ids=${SUBDEMO}`)

    expect(companyServiceCalls()[0][0]).toBe(
      `http://company-service.default:4000/api/companies?ids=${SUBDEMO}`,
    )
  })

  it('answers an empty list for no ids, without asking the company-service', async () => {
    const response = await getCompanies([TICKET])

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [] })
    expect(companyServiceCalls()).toHaveLength(0)
  })

  it('refuses an id that is not a uuid, instead of reading it as an unknown company', async () => {
    const response = await getCompanies([TICKET], `?ids=${SUBDEMO}&ids=nope`)

    expect(response.statusCode).toBe(400)
    expect(companyServiceCalls()).toHaveLength(0)
  })

  it('accepts 100 ids', async () => {
    fetchMock.mockImplementation(() => jsonResponse({ companies: [] }))
    const ids = Array.from({ length: 100 }, () => `ids=${crypto.randomUUID()}`).join('&')

    const response = await getCompanies([TICKET], `?${ids}`)

    expect(response.statusCode).toBe(200)
  })

  it('refuses 101 ids, which past the ingress stop fitting in a URL at all', async () => {
    const ids = Array.from({ length: 101 }, () => `ids=${crypto.randomUUID()}`).join('&')

    const response = await getCompanies([TICKET], `?${ids}`)

    expect(response.statusCode).toBe(400)
    expect(companyServiceCalls()).toHaveLength(0)
  })

  it.each([
    ['unreachable', () => Promise.reject(new Error('ECONNREFUSED'))],
    ['failing', () => jsonResponse({ error: 'boom' }, 500)],
    ['answering garbage', () => jsonResponse({ nope: true })],
  ])('answers 503, not 500, when the company-service is %s', async (_case, upstream) => {
    fetchMock.mockImplementation(upstream)

    const response = await getCompanies([TICKET], `?ids=${SUBDEMO}`)

    expect(response.statusCode).toBe(503)
  })
})
