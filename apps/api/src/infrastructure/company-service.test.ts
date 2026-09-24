import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPANIES_TIMEOUT_MS, getCompanies } from './company-service.js'
import { jsonResponse } from '../shared/json.test-helpers.js'

const BASE_URL = 'http://company-service.default:4000'
const SUBDEMO = 'ed635b72-77d2-41f9-9b2a-2ceb55c19b52'
const OTHER = '6f1c1b0e-3f2a-4c55-9d7e-2b8a4e1f0c11'

describe('getCompanies', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the companies the company-service knows, with the tax id renamed', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ companies: [{ id: SUBDEMO, 'tax-id': '32454452000130', name: 'SubDemo25' }] }),
    )

    const companies = await getCompanies({ baseUrl: BASE_URL, ids: [SUBDEMO, OTHER] })

    expect(companies).toEqual([{ id: SUBDEMO, name: 'SubDemo25', taxId: '32454452000130' }])
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE_URL}/api/companies?ids=${SUBDEMO},${OTHER}`)
    expect(options.redirect).toBe('error')
  })

  it('reaches the right path even if the base url carries a trailing slash', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ companies: [] }))

    await getCompanies({ baseUrl: `${BASE_URL}/`, ids: [SUBDEMO] })

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE_URL}/api/companies?ids=${SUBDEMO}`)
  })

  it('asks nothing for no ids', async () => {
    expect(await getCompanies({ baseUrl: BASE_URL, ids: [] })).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads a company with no name or tax id as having none', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ companies: [{ id: SUBDEMO, 'tax-id': null, name: null }] }),
    )

    expect(await getCompanies({ baseUrl: BASE_URL, ids: [SUBDEMO] })).toEqual([
      { id: SUBDEMO, name: null, taxId: null },
    ])
  })

  it('drops a company that was not asked for', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        companies: [
          { id: SUBDEMO, 'tax-id': '32454452000130', name: 'SubDemo25' },
          { id: OTHER, 'tax-id': '11222333000181', name: 'Outra' },
        ],
      }),
    )

    expect(await getCompanies({ baseUrl: BASE_URL, ids: [SUBDEMO] })).toEqual([
      { id: SUBDEMO, name: 'SubDemo25', taxId: '32454452000130' },
    ])
  })

  it.each([
    ['not even an object', null],
    ['an id that is not a uuid', { id: 'abc', 'tax-id': null, name: 'Quebrada' }],
    ['a name that is not text', { id: OTHER, 'tax-id': null, name: 42 }],
    ['a tax id that is not text', { id: OTHER, 'tax-id': 11222333000181, name: 'Outra' }],
  ])('drops a row with %s, and says so', async (_case, row) => {
    const warn = vi.fn()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ companies: [row, { id: SUBDEMO, 'tax-id': null, name: 'SubDemo25' }] }),
    )

    const companies = await getCompanies({
      baseUrl: BASE_URL,
      ids: [SUBDEMO, OTHER],
      logger: { warn },
    })

    expect(companies).toEqual([{ id: SUBDEMO, name: 'SubDemo25', taxId: null }])
    expect(warn).toHaveBeenCalledWith({ dropped: 1, seen: 2 }, expect.any(String))
  })

  it('answers 503 when the company-service cannot be reached', async () => {
    const upstream = new Error('ECONNREFUSED')
    fetchMock.mockRejectedValueOnce(upstream)

    await expect(getCompanies({ baseUrl: BASE_URL, ids: [SUBDEMO] })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
      message: 'company-service is unreachable',
      cause: upstream,
    })
  })

  it('answers 503 when the company-service fails, keeping its status out of the message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))

    await expect(getCompanies({ baseUrl: BASE_URL, ids: [SUBDEMO] })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
      message: 'company-service is unavailable',
    })
  })

  it('answers 503 when a 200 carries a body it cannot read', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    await expect(getCompanies({ baseUrl: BASE_URL, ids: [SUBDEMO] })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
      cause: { message: 'answered a body that is not JSON' },
    })
  })

  it('answers 503 when a 200 carries no company list, instead of reading it as none', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }))

    await expect(getCompanies({ baseUrl: BASE_URL, ids: [SUBDEMO] })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
    })
  })

  describe('the deadline', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('gives up on a hung company-service instead of holding the request open', async () => {
      fetchMock.mockImplementation(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(options.signal.reason))
          }),
      )

      // Asserted before the clock moves: the abort fires inside the advance,
      // and an unhandled rejection there takes the whole suite down.
      const refused = expect(
        getCompanies({ baseUrl: BASE_URL, ids: [SUBDEMO] }),
      ).rejects.toMatchObject({
        name: 'ServiceUnavailableError',
      })
      await vi.advanceTimersByTimeAsync(COMPANIES_TIMEOUT_MS + 1)

      await refused
    })

    it('keeps the signal armed while the body is being read', async () => {
      let abortedDuringBody: boolean | null = null

      fetchMock.mockImplementationOnce(async (_url: string, options: { signal: AbortSignal }) => ({
        ok: true,
        status: 200,
        json: async () => {
          await vi.advanceTimersByTimeAsync(COMPANIES_TIMEOUT_MS + 1)
          abortedDuringBody = options.signal.aborted
          return { companies: [] }
        },
      }))

      await getCompanies({ baseUrl: BASE_URL, ids: [SUBDEMO] })

      expect(abortedDuringBody).toBe(true)
    })
  })
})
