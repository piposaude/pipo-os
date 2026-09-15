import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertServiceTokenIsLocalOnly,
  LISTING_TIMEOUT_MS,
  listPipoUsers,
  MAX_PAGES,
  PAGE_TIMEOUT_MS,
  PAGES_WARNING_AT,
} from './auth-service-users.js'
import { jsonResponse, usersPage } from '../shared/json.test-helpers.js'

const BASE_URL = 'http://auth-service.platform:4000'

describe('listPipoUsers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('SERVICE_ACCOUNT_TOKEN', 'token-from-env')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('returns the pipo members the auth-service listed', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        users: [
          { id: 'b1', email: 'ana@piposaude.com.br', name: 'Ana Souza' },
          { id: 'b2', email: 'bruno@piposaude.com.br', name: 'Bruno Lima' },
        ],
        total: 2,
        'next-cursor': null,
      }),
    )

    const users = await listPipoUsers({ baseUrl: BASE_URL })

    expect(users).toEqual([
      { email: 'ana@piposaude.com.br', name: 'Ana Souza' },
      { email: 'bruno@piposaude.com.br', name: 'Bruno Lima' },
    ])

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BASE_URL}/api/users?email-type=pipo-email&limit=100`)
    expect(options.headers).toMatchObject({ authorization: 'Bearer token-from-env' })
  })

  it('follows the cursor to the end, so one call returns the whole list', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'ana@piposaude.com.br', name: 'Ana Souza' }],
          total: 2,
          'next-cursor': 'MQ==',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'bruno@piposaude.com.br', name: 'Bruno Lima' }],
          total: 2,
          'next-cursor': null,
        }),
      )

    const users = await listPipoUsers({ baseUrl: BASE_URL })

    expect(users.map((user) => user.email)).toEqual([
      'ana@piposaude.com.br',
      'bruno@piposaude.com.br',
    ])
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${BASE_URL}/api/users?email-type=pipo-email&limit=100&cursor=MQ%3D%3D`,
    )
  })

  it('refuses a listing it could not finish, instead of returning a truncated one', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse({
        users: [{ email: 'ana@piposaude.com.br', name: 'Ana Souza' }],
        total: 10_000,
        'next-cursor': 'MQ==',
      }),
    )

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
    })
    expect(fetchMock).toHaveBeenCalledTimes(MAX_PAGES)
  })

  it('warns before the ceiling, not after it', () => {
    expect(PAGES_WARNING_AT).toBeLessThan(MAX_PAGES)
  })

  it('warns on the way to the ceiling, so growth is readable before it is an outage', async () => {
    const warn = vi.fn()
    fetchMock.mockImplementation(() =>
      jsonResponse({
        users: [{ email: 'ana@piposaude.com.br', name: 'Ana Souza' }],
        total: 10_000,
        'next-cursor': 'MQ==',
      }),
    )

    await expect(listPipoUsers({ baseUrl: BASE_URL, logger: { warn } })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
    })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ pages: PAGES_WARNING_AT, maxPages: MAX_PAGES }),
      expect.any(String),
    )
  })

  it('says nothing about the ceiling on a listing that ends far from it', async () => {
    const warn = vi.fn()
    fetchMock
      .mockResolvedValueOnce(usersPage([{ email: 'ana@piposaude.com.br', name: 'Ana' }], 'MQ==', 2))
      .mockResolvedValueOnce(
        usersPage([{ email: 'bruno@piposaude.com.br', name: 'Bruno' }], null, 2),
      )

    await listPipoUsers({ baseUrl: BASE_URL, logger: { warn } })

    expect(warn).not.toHaveBeenCalled()
  })

  it('refuses a cursor that is not a string, instead of reading it as the end', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        users: [{ email: 'ana@piposaude.com.br', name: 'Ana Souza' }],
        total: 10_000,
        'next-cursor': 2,
      }),
    )

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
    })
  })

  it('refuses an empty cursor, instead of reading it as the end', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        users: [{ email: 'ana@piposaude.com.br', name: 'Ana Souza' }],
        total: 10_000,
        'next-cursor': '',
      }),
    )

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
    })
  })

  it.each([{ total: '200' }, { total: -1 }, { total: 1.5 }])(
    'refuses a total that is not a count of people ($total), instead of ignoring it',
    async ({ total }) => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'ana@piposaude.com.br', name: 'Ana Souza' }],
          total,
          'next-cursor': null,
        }),
      )

      await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
        name: 'ServiceUnavailableError',
      })
    },
  )

  it('refuses a listing that ends short of the total the upstream published', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        users: [{ email: 'ana@piposaude.com.br', name: 'Ana Souza' }],
        total: 200,
        'next-cursor': null,
      }),
    )

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
    })
  })

  it('accepts a listing whose total counts a row this side dropped', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        users: [{ email: 'ana@piposaude.com.br', name: 'Ana Souza' }, { email: 'quebrado' }],
        total: 2,
        'next-cursor': null,
      }),
    )

    await expect(listPipoUsers({ baseUrl: BASE_URL })).resolves.toEqual([
      { email: 'ana@piposaude.com.br', name: 'Ana Souza' },
    ])
  })

  it('reads the token again on every call, because the kubelet rotates it', async () => {
    fetchMock.mockImplementation(() => usersPage([]))

    await listPipoUsers({ baseUrl: BASE_URL })
    vi.stubEnv('SERVICE_ACCOUNT_TOKEN', 'token-after-rotation')
    await listPipoUsers({ baseUrl: BASE_URL })

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer token-from-env')
    expect(fetchMock.mock.calls[1][1].headers.authorization).toBe('Bearer token-after-rotation')
  })

  it('leaves a trace when it drops someone, instead of shrinking the list quietly', async () => {
    const warn = vi.fn()
    fetchMock.mockResolvedValueOnce(
      usersPage([{ email: 'quebrado' }, { email: 'ana@piposaude.com.br' }]),
    )

    await listPipoUsers({ baseUrl: BASE_URL, logger: { warn } })

    expect(warn).toHaveBeenCalledWith({ dropped: 1, seen: 2, kept: 1 }, expect.any(String))
  })

  it('reports the drop even when the listing then fails', async () => {
    const warn = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'quebrado' }, { email: 'ana@piposaude.com.br' }],
          total: 2,
          'next-cursor': 'MQ==',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'bruno@piposaude.com.br' }],
          total: 1,
          'next-cursor': null,
        }),
      )

    await expect(listPipoUsers({ baseUrl: BASE_URL, logger: { warn } })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
    })
    expect(warn).toHaveBeenCalledWith({ dropped: 1, seen: 3, kept: 2 }, expect.any(String))
  })

  it('warns when the pages repeated someone, so fewer people arrived than counted', async () => {
    const warn = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'ana@piposaude.com.br' }],
          total: 2,
          'next-cursor': 'MQ==',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'ana@piposaude.com.br' }, { email: 'bruno@piposaude.com.br' }],
          total: 3,
          'next-cursor': null,
        }),
      )

    await listPipoUsers({ baseUrl: BASE_URL, logger: { warn } })

    expect(warn).toHaveBeenCalledWith({ kept: 2, dropped: 0, total: 3 }, expect.any(String))
  })

  it('says nothing when it drops nobody', async () => {
    const warn = vi.fn()
    fetchMock.mockResolvedValueOnce(usersPage([{ email: 'ana@piposaude.com.br' }]))

    await listPipoUsers({ baseUrl: BASE_URL, logger: { warn } })

    expect(warn).not.toHaveBeenCalled()
  })

  it('drops a row that is not even an object, instead of breaking the page', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ users: [null], total: 1, 'next-cursor': null }))

    expect(await listPipoUsers({ baseUrl: BASE_URL })).toEqual([])
  })

  it('drops a row whose e-mail is not one, instead of publishing it', async () => {
    fetchMock.mockResolvedValueOnce(
      usersPage([
        { email: 'not-an-email', name: 'Quebrado' },
        { email: 'ana@piposaude.com.br', name: 'Ana Souza' },
      ]),
    )

    expect(await listPipoUsers({ baseUrl: BASE_URL })).toEqual([
      { email: 'ana@piposaude.com.br', name: 'Ana Souza' },
    ])
  })

  // Each one passed the previous filter and failed the route's serializer,
  // which answers 500 for the whole page.
  it.each([
    'ana..souza@piposaude.com.br',
    'ana@piposaude.com.br.',
    'ana!souza@piposaude.com.br',
    'anã@piposaude.com.br',
    'a@b.c',
  ])('drops %s, which the published schema would refuse', async (email) => {
    fetchMock.mockResolvedValueOnce(usersPage([{ email }, { email: 'ana@piposaude.com.br' }]))

    expect(await listPipoUsers({ baseUrl: BASE_URL })).toEqual([
      { email: 'ana@piposaude.com.br', name: null },
    ])
  })

  // The body here is people's names and e-mails, and pino folds cause.message
  // into its own.
  it('keeps the body out of the error when the answer is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"users":[{"email":"ana@piposaude.com.br","name":"Ana Souza"', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      cause: { message: 'answered a body that is not JSON' },
    })
  })

  it('keeps the addresses a person really has', async () => {
    fetchMock.mockResolvedValueOnce(
      usersPage([
        { email: 'ana.souza+teste@piposaude.com.br' },
        { email: 'ana@mail.piposaude.com.br' },
        { email: "o'brien@piposaude.com.br" },
        { email: 'ana-souza@pipo.ai' },
      ]),
    )

    expect((await listPipoUsers({ baseUrl: BASE_URL })).map((user) => user.email)).toEqual([
      'ana.souza+teste@piposaude.com.br',
      'ana@mail.piposaude.com.br',
      "o'brien@piposaude.com.br",
      'ana-souza@pipo.ai',
    ])
  })

  it('lowercases the e-mail, because it is the key the tickets are joined by', async () => {
    fetchMock.mockResolvedValueOnce(usersPage([{ email: 'Ana.Souza@Piposaude.com.br' }]))

    expect(await listPipoUsers({ baseUrl: BASE_URL })).toEqual([
      { email: 'ana.souza@piposaude.com.br', name: null },
    ])
  })

  it('refuses a listing whose upstream snapshot shrank mid-drain', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'ana@piposaude.com.br' }],
          total: 3,
          'next-cursor': 'MQ==',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'bruno@piposaude.com.br' }],
          total: 2,
          'next-cursor': null,
        }),
      )

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
    })
  })

  it('accepts a listing whose upstream snapshot grew mid-drain', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'ana@piposaude.com.br' }],
          total: 2,
          'next-cursor': 'MQ==',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'ana@piposaude.com.br' }, { email: 'bruno@piposaude.com.br' }],
          total: 3,
          'next-cursor': null,
        }),
      )

    expect((await listPipoUsers({ baseUrl: BASE_URL })).map((user) => user.email)).toEqual([
      'ana@piposaude.com.br',
      'bruno@piposaude.com.br',
    ])
  })

  it('accepts a listing drained over a snapshot that stayed the same size', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'ana@piposaude.com.br' }],
          total: 2,
          'next-cursor': 'MQ==',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          users: [{ email: 'bruno@piposaude.com.br' }],
          total: 2,
          'next-cursor': null,
        }),
      )

    expect(await listPipoUsers({ baseUrl: BASE_URL })).toHaveLength(2)
  })

  // The upstream cursor is an offset over a snapshot it keeps for 60 s: a
  // listing that crosses that line reads shifted pages.
  it('does not repeat a person the cursor handed over twice', async () => {
    fetchMock
      .mockResolvedValueOnce(usersPage([{ email: 'ana@piposaude.com.br', name: 'Ana' }], 'MQ==', 2))
      .mockResolvedValueOnce(usersPage([{ email: 'ana@piposaude.com.br', name: 'Ana' }], null, 2))

    expect(await listPipoUsers({ baseUrl: BASE_URL })).toEqual([
      { email: 'ana@piposaude.com.br', name: 'Ana' },
    ])
  })

  it('reads a member with no name as having none', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        users: [{ email: 'carla@piposaude.com.br' }],
        total: 1,
        'next-cursor': null,
      }),
    )

    const users = await listPipoUsers({ baseUrl: BASE_URL })

    expect(users).toEqual([{ email: 'carla@piposaude.com.br', name: null }])
  })

  it('answers 503 when the auth-service refuses our own identity', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 403))

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
      statusCode: 503,
    })
  })

  it('answers 503 when the auth-service cannot be reached at all', async () => {
    const upstream = new Error('ECONNREFUSED')
    fetchMock.mockRejectedValueOnce(upstream)

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
      message: 'auth-service user listing is unreachable',
      cause: upstream,
    })
  })

  it('answers 503 when there is no service account token to present', async () => {
    vi.stubEnv('SERVICE_ACCOUNT_TOKEN', '')
    fetchMock.mockImplementation(() => usersPage([]))

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
      statusCode: 503,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 503 when a 200 carries a body it cannot read', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
    })
  })

  it('answers 503 when a 200 carries no user list, instead of reading it as nobody', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0 }))

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
    })
  })

  it('keeps the upstream status out of the published message', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 403))

    await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
      message: 'auth-service user listing is unavailable',
    })
  })

  it('reaches the right path even if the base url carries a trailing slash', async () => {
    fetchMock.mockResolvedValueOnce(usersPage([]))

    await listPipoUsers({ baseUrl: `${BASE_URL}/` })

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE_URL}/api/users?email-type=pipo-email&limit=100`)
  })

  // Rejecting on abort is what a real fetch does, and it is the only way the
  // deadline can be observed from here.
  const hangUntilAborted = (): Promise<Response> =>
    new Promise((_resolve, reject) => {
      const signal = fetchMock.mock.calls.at(-1)![1].signal as AbortSignal
      signal.addEventListener('abort', () => reject(signal.reason))
    })

  describe('the deadlines', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('gives up on a hung page instead of holding the request open', async () => {
      fetchMock.mockImplementation(hangUntilAborted)

      // Asserted before the clock moves: the abort fires inside the advance,
      // and an unhandled rejection there takes the whole suite down.
      const refused = expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
        name: 'ServiceUnavailableError',
      })
      await vi.advanceTimersByTimeAsync(PAGE_TIMEOUT_MS + 1)

      await refused
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    // fetch resolves on the headers: a deadline cleared there would leave a
    // body that trickles in afterwards unbounded.
    it('keeps the page signal armed while the body is being read', async () => {
      let abortedDuringBody: boolean | null = null

      fetchMock.mockImplementationOnce(async (_url: string, options: { signal: AbortSignal }) => ({
        ok: true,
        status: 200,
        json: async () => {
          await vi.advanceTimersByTimeAsync(PAGE_TIMEOUT_MS + 1)
          abortedDuringBody = options.signal.aborted
          return { users: [], 'next-cursor': null }
        },
      }))

      await listPipoUsers({ baseUrl: BASE_URL })

      expect(abortedDuringBody).toBe(true)
    })

    it('bounds the whole listing, not only each page', async () => {
      // Each page answers just inside its own timeout, so only a budget for the
      // listing as a whole can stop the drain.
      fetchMock.mockImplementation(async (_url: string, options: { signal: AbortSignal }) => {
        await vi.advanceTimersByTimeAsync(PAGE_TIMEOUT_MS - 1)
        if (options.signal.aborted) {
          throw options.signal.reason
        }
        return usersPage([{ email: 'ana@piposaude.com.br' }], 'MQ==', 10_000)
      })

      await expect(listPipoUsers({ baseUrl: BASE_URL })).rejects.toMatchObject({
        name: 'ServiceUnavailableError',
      })
      expect(fetchMock).toHaveBeenCalledTimes(
        Math.min(MAX_PAGES, Math.ceil(LISTING_TIMEOUT_MS / (PAGE_TIMEOUT_MS - 1))),
      )
    })
  })
})

describe('assertServiceTokenIsLocalOnly', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('lets a machine with no token of its own boot anywhere', () => {
    vi.stubEnv('SERVICE_ACCOUNT_TOKEN', '')
    vi.stubEnv('APP_ENV', 'prod')

    expect(() => assertServiceTokenIsLocalOnly()).not.toThrow()
  })

  it('lets a developer machine boot with a pasted token', () => {
    vi.stubEnv('SERVICE_ACCOUNT_TOKEN', 'pasted-token')
    vi.stubEnv('APP_ENV', '')
    vi.stubEnv('NODE_ENV', 'development')

    expect(() => assertServiceTokenIsLocalOnly()).not.toThrow()
  })

  it.each(['stag', 'prod'])('refuses to boot with a pasted token in %s', (appEnv) => {
    vi.stubEnv('SERVICE_ACCOUNT_TOKEN', 'pasted-token')
    vi.stubEnv('APP_ENV', appEnv)

    expect(() => assertServiceTokenIsLocalOnly()).toThrow(/never be set in a deployed environment/)
  })

  it('refuses to boot with a pasted token in production', () => {
    vi.stubEnv('SERVICE_ACCOUNT_TOKEN', 'pasted-token')
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => assertServiceTokenIsLocalOnly()).toThrow(/never be set in a deployed environment/)
  })
})
