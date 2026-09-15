import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthServiceUser } from '../../infrastructure/auth-service-users.js'
import { MAX_STALE_MS, RETRY_FLOOR_MS, UsersService, USERS_TTL_MS } from './service.js'

const ANA = { email: 'ana.souza@piposaude.com.br', name: 'Ana Souza' }
const BRUNO = { email: 'bruno@piposaude.com.br', name: 'Bruno Lima' }
const CARLA = { email: 'carla@piposaude.com.br', name: 'Cecília Rocha' }

function serviceOver(pages: AuthServiceUser[][]): { service: UsersService; calls: () => number } {
  let call = 0
  const load = vi.fn(async () => {
    const page = pages[Math.min(call, pages.length - 1)]
    call += 1
    return page
  })

  return { service: new UsersService(load), calls: () => load.mock.calls.length }
}

describe('UsersService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the people the auth-service gave', async () => {
    const { service } = serviceOver([[ANA, BRUNO]])

    expect(await service.list({})).toEqual([ANA, BRUNO])
  })

  it('serves a second call from the snapshot instead of going upstream again', async () => {
    const { service, calls } = serviceOver([[ANA], [BRUNO]])

    expect(await service.list({})).toEqual([ANA])
    expect(await service.list({})).toEqual([ANA])
    expect(calls()).toBe(1)
  })

  it('finds a person by the exact e-mail, whatever case it was asked in', async () => {
    const { service } = serviceOver([[ANA, BRUNO]])

    expect(await service.byEmail('  ANA.SOUZA@piposaude.com.br ')).toEqual(ANA)
  })

  // The fuzzy search would answer the neighbour: `ana@` is a substring of
  // `ana.souza@`, and the session would publish the wrong person's name.
  it('answers nobody for an e-mail that only looks like one in the list', async () => {
    const { service } = serviceOver([[ANA, BRUNO]])

    expect(await service.byEmail('ana@piposaude.com.br')).toBeNull()
  })

  it('hands out a copy, so a caller reordering its list does not reorder the cache', async () => {
    const { service } = serviceOver([[ANA, BRUNO]])

    const first = await service.list({})
    first.reverse()

    expect(await service.list({})).toEqual([ANA, BRUNO])
  })

  it('goes upstream again once the snapshot is older than the TTL', async () => {
    const { service, calls } = serviceOver([[ANA], [BRUNO]])

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + 1)

    // The call that outlives the TTL triggers the refresh and answers with
    // what it has; the new result belongs to the next reader.
    expect(await service.list({})).toEqual([ANA])
    expect(calls()).toBe(2)

    expect(await service.list({})).toEqual([BRUNO])
  })

  it('filters the snapshot without asking the auth-service again', async () => {
    const { service, calls } = serviceOver([[ANA, BRUNO, CARLA]])

    await service.list({})

    expect(await service.list({ search: 'bru' })).toEqual([BRUNO])
    expect(calls()).toBe(1)
  })

  it('matches the search ignoring case and accents, on name and on e-mail', async () => {
    const { service } = serviceOver([[ANA, BRUNO, CARLA]])

    expect(await service.list({ search: 'CECILIA' })).toEqual([CARLA])
    expect(await service.list({ search: 'ana.souza@pipo' })).toEqual([ANA])
  })

  it('matches nobody rather than everybody when the search has no hit', async () => {
    const { service } = serviceOver([[ANA, BRUNO]])

    expect(await service.list({ search: 'zeca' })).toEqual([])
  })

  it('does not cache a failure: once the retry floor passes, it tries again', async () => {
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockRejectedValueOnce(new Error('auth-service is down'))
      .mockResolvedValueOnce([ANA])
    const service = new UsersService(load)

    await expect(service.list({})).rejects.toThrow('auth-service is down')
    vi.advanceTimersByTime(RETRY_FLOOR_MS + 1)

    expect(await service.list({})).toEqual([ANA])
    expect(load).toHaveBeenCalledTimes(2)
  })

  // Without this, every call during a long outage pays the full listing
  // timeout before failing.
  it('fails fast inside the retry floor instead of calling the auth-service again', async () => {
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockRejectedValue(new Error('auth-service is down'))
    const service = new UsersService(load)

    await expect(service.list({})).rejects.toThrow('auth-service is down')
    await expect(service.list({})).rejects.toThrow('auth-service is down')

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('still holds the auth-service off after the stale ceiling, instead of calling it per request', async () => {
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockRejectedValue(new Error('auth-service is down'))
    const service = new UsersService(load)

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + MAX_STALE_MS + 1)
    await expect(service.list({})).rejects.toThrow('auth-service is down')

    await expect(service.list({})).rejects.toThrow('auth-service is down')
    await expect(service.list({})).rejects.toThrow('auth-service is down')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not serve a snapshot past the ceiling just because a retry is being held off', async () => {
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockRejectedValue(new Error('auth-service is down'))
    const service = new UsersService(load)

    await service.list({})
    // Fails just before the ceiling: the hold-off would reach past it.
    vi.advanceTimersByTime(USERS_TTL_MS + MAX_STALE_MS - 1_000)
    expect(await service.list({})).toEqual([ANA])

    vi.advanceTimersByTime(2_000)
    await expect(service.list({})).rejects.toThrow('auth-service is down')
  })

  // /api/auth/me runs through here on every page load, and the session store
  // sits in `loading` while it waits.
  it('answers from the snapshot while the refresh runs behind it', async () => {
    let finishRefresh: (users: AuthServiceUser[]) => void = () => undefined
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRefresh = resolve
          }),
      )
    const service = new UsersService(load)

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + 1)

    expect(await service.list({})).toEqual([ANA])
    expect(load).toHaveBeenCalledTimes(2)

    finishRefresh([BRUNO])
    await vi.advanceTimersByTimeAsync(0)

    expect(await service.list({})).toEqual([BRUNO])
  })

  it('does not make a concurrent caller wait out a refresh that is going to fail', async () => {
    let failRefresh: (error: Error) => void = () => undefined
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failRefresh = reject
          }),
      )
    const service = new UsersService(load)

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + 1)

    const refreshing = service.list({}).catch(() => undefined)
    // Arrives while the refresh still hangs, and gets the snapshot at once.
    expect(await service.list({})).toEqual([ANA])
    // One listing for both: the shared inFlight is what proves it.
    expect(load).toHaveBeenCalledTimes(2)

    failRefresh(new Error('auth-service is down'))
    await refreshing
  })

  it('serves the snapshot it still has when the refresh fails, instead of losing every name', async () => {
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockRejectedValue(new Error('auth-service is down'))
    const service = new UsersService(load)

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + 1)

    expect(await service.list({})).toEqual([ANA])
  })

  it('still refuses when the refresh fails and there is no snapshot to fall back on', async () => {
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockRejectedValue(new Error('auth-service is down'))

    await expect(new UsersService(load).list({})).rejects.toThrow('auth-service is down')
  })

  it('stops serving the stale snapshot once it is older than the outage is worth hiding', async () => {
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockRejectedValue(new Error('auth-service is down'))
    const service = new UsersService(load)

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + MAX_STALE_MS + 1)

    await expect(service.list({})).rejects.toThrow('auth-service is down')
  })

  // The age that matters is the data's, not the last attempt's: a retry that
  // refreshed the clock would hide an outage of any length.
  it('counts the age from the last success, however many refreshes failed meanwhile', async () => {
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockRejectedValue(new Error('auth-service is down'))
    const service = new UsersService(load)

    await service.list({})

    // Ten failed refreshes, spread over more than the ceiling.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      vi.advanceTimersByTime((USERS_TTL_MS + MAX_STALE_MS) / 5)
      await service.list({}).catch(() => undefined)
    }

    await expect(service.list({})).rejects.toThrow('auth-service is down')
  })

  it('waits before trying a failed auth-service again, instead of paying the timeout per call', async () => {
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockRejectedValue(new Error('auth-service is down'))
    const service = new UsersService(load)

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + 1)
    await service.list({})

    expect(await service.list({})).toEqual([ANA])
    expect(load).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(RETRY_FLOOR_MS + 1)
    await service.list({})

    expect(load).toHaveBeenCalledTimes(3)
  })

  // The window is counted on top of the TTL: a longer TTL must not swallow the
  // ceiling, nor erase the stale window it grants.
  it('grants the stale window on top of whatever TTL it was given', async () => {
    const ONE_HOUR = 60 * 60 * 1000
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockRejectedValue(new Error('auth-service is down'))
    const service = new UsersService(load, undefined, ONE_HOUR)

    await service.list({})
    vi.advanceTimersByTime(ONE_HOUR + 1)

    expect(await service.list({})).toEqual([ANA])

    vi.advanceTimersByTime(MAX_STALE_MS)
    await expect(service.list({})).rejects.toThrow('auth-service is down')
  })

  // Nobody awaits a background refresh: without this line the auth-service can
  // be down for 35 minutes with no trace in this service.
  it('logs the failure of a refresh that nobody is waiting for', async () => {
    const warn = vi.fn()
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockRejectedValue(new Error('auth-service is down'))
    const service = new UsersService(load, { warn })

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + 1)
    await service.list({})
    await vi.advanceTimersByTimeAsync(0)

    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('warns when the list comes back smaller than the one it replaces', async () => {
    const warn = vi.fn()
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA, BRUNO, CARLA])
      .mockResolvedValue([ANA])
    const service = new UsersService(load, { warn })

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + 1)
    await service.list({})
    await vi.advanceTimersByTimeAsync(0)

    expect(await service.list({})).toEqual([ANA])
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ was: 3, now: 1 }),
      expect.stringContaining('fewer people'),
    )
  })

  it('says nothing when the list grows', async () => {
    const warn = vi.fn()
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA])
      .mockResolvedValue([ANA, BRUNO])
    const service = new UsersService(load, { warn })

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + 1)
    await service.list({})
    await vi.advanceTimersByTimeAsync(0)

    expect(warn).not.toHaveBeenCalled()
  })

  // The upstream builds its total from what it loaded, so a listing it
  // truncated arrives consistent with itself and passes every check.
  it('refuses a list that came back empty when it had people a moment ago', async () => {
    const load = vi
      .fn<() => Promise<AuthServiceUser[]>>()
      .mockResolvedValueOnce([ANA, BRUNO])
      .mockResolvedValue([])
    const service = new UsersService(load)

    await service.list({})
    vi.advanceTimersByTime(USERS_TTL_MS + 1)

    expect(await service.list({})).toEqual([ANA, BRUNO])
    await vi.advanceTimersByTimeAsync(0)
    expect(await service.list({})).toEqual([ANA, BRUNO])

    // What the route publishes: 503 like every other list failure, not
    // the 500 a bare Error becomes in the error handler.
    vi.advanceTimersByTime(MAX_STALE_MS)
    await expect(service.list({})).rejects.toMatchObject({
      name: 'ServiceUnavailableError',
      statusCode: 503,
    })
  })

  it('accepts an empty list when there was nothing before it', async () => {
    const { service } = serviceOver([[]])

    expect(await service.list({})).toEqual([])
  })

  it('keeps one listing in flight when two callers arrive on a cold snapshot', async () => {
    const load = vi.fn<() => Promise<AuthServiceUser[]>>().mockResolvedValue([ANA])
    const service = new UsersService(load)

    await Promise.all([service.list({}), service.list({})])

    expect(load).toHaveBeenCalledTimes(1)
  })
})
