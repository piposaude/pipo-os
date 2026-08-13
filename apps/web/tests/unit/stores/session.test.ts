import { useSessionStore } from '@/stores/session'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('useSessionStore', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    useSessionStore.setState({ status: 'idle', user: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('authenticates when /api/auth/me succeeds', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ email: 'pikachu@piposaude.com.br', policies: [] }),
    )

    await useSessionStore.getState().load()

    expect(useSessionStore.getState()).toMatchObject({
      status: 'authenticated',
      user: { email: 'pikachu@piposaude.com.br', policies: [] },
    })
  })

  it('marks unauthenticated on a confirmed 401', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401))

    await useSessionStore.getState().load()

    expect(useSessionStore.getState()).toMatchObject({ status: 'unauthenticated', user: null })
  })

  // Regression test: a 5xx or network failure is not proof there is no
  // session — treating it as "unauthenticated" would make ensureSession()
  // skip every future hydration attempt and permanently lock out a visitor
  // who actually has a valid cookie.
  it('falls back to idle (not unauthenticated) on a 5xx, so a later load can retry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 500))

    await useSessionStore.getState().load()

    expect(useSessionStore.getState()).toMatchObject({ status: 'idle', user: null })
  })

  it('falls back to idle on a network failure, so a later load can retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await useSessionStore.getState().load()

    expect(useSessionStore.getState()).toMatchObject({ status: 'idle', user: null })
  })

  it('clears the session on logout even when the API call fails', async () => {
    useSessionStore.setState({
      status: 'authenticated',
      user: { email: 'pikachu@piposaude.com.br', policies: [] },
    })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await useSessionStore.getState().logout()

    expect(useSessionStore.getState()).toMatchObject({ status: 'unauthenticated', user: null })
  })
})
