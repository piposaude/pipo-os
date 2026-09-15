import type { FastifyBaseLogger } from 'fastify'
import { ServiceUnavailableError } from '../../shared/errors.js'
import { foldText } from '../../shared/text.js'
import type { AuthServiceUser } from '../../infrastructure/auth-service-users.js'

/** Long enough that a queue redraw costs no round trip, short enough that a
 *  name changed in the auth-service shows up in the same shift. */
export const USERS_TTL_MS = 5 * 60 * 1000

/** The stale window on top of the TTL: past `ttlMs + this` the error propagates
 *  again, so a days-long outage shows up as 5xx instead of frozen names. */
export const MAX_STALE_MS = 30 * 60 * 1000

/** While serving stale, how long before the auth-service is tried again. Without
 *  it every request would pay the listing timeout before falling back. */
export const RETRY_FLOOR_MS = 30 * 1000

/** What a session waits on a cold list before answering with no name: the page
 *  load blocks on it, and the listing budget is measured in tens of seconds. */
export const NAME_WAIT_MS = 2 * 1000

declare module 'fastify' {
  interface FastifyInstance {
    users: UsersService
  }
}

export interface ListUsersQuery {
  search?: string
}

interface Snapshot {
  users: AuthServiceUser[]
  /** `users[i]` folded for search, once per refresh: the filter runs over the
   *  whole list on every keystroke the queue sends. */
  folded: Array<{ name: string; email: string }>
  /** When it was loaded *successfully* — a failed refresh must not rejuvenate
   *  it, or a long outage would stay hidden forever. */
  loadedAt: number
}

function snapshotOf(users: AuthServiceUser[]): Snapshot {
  return {
    users,
    folded: users.map((user) => ({
      name: foldText(user.name ?? ''),
      email: foldText(user.email),
    })),
    loadedAt: Date.now(),
  }
}

export class UsersService {
  private snapshot: Snapshot | null = null
  private failure: { error: unknown; retryAt: number } | null = null
  // A cold snapshot under two callers would otherwise drain the upstream twice.
  private inFlight: Promise<Snapshot> | null = null
  /** Counted on top of the TTL, not against it: a longer TTL would otherwise
   *  either swallow the ceiling or erase the stale window entirely. */
  private readonly maxStaleMs: number

  constructor(
    private readonly load: () => Promise<AuthServiceUser[]>,
    private readonly logger?: Pick<FastifyBaseLogger, 'warn'>,
    private readonly ttlMs: number = USERS_TTL_MS,
  ) {
    this.maxStaleMs = ttlMs + MAX_STALE_MS
  }

  private within(ms: number): Snapshot | null {
    return this.snapshot && Date.now() - this.snapshot.loadedAt < ms ? this.snapshot : null
  }

  async list({ search }: ListUsersQuery): Promise<AuthServiceUser[]> {
    const snapshot = await this.current()
    const needle = search?.trim() ? foldText(search.trim()) : null

    // A new array, so that a caller sorting its own list does not reorder the
    // snapshot every other caller reads for the rest of the TTL.
    return needle
      ? snapshot.users.filter((_, index) => {
          const folded = snapshot.folded[index]
          return folded.name.includes(needle) || folded.email.includes(needle)
        })
      : [...snapshot.users]
  }

  /** The exact e-mail, not `search`: the fuzzy match is a substring one, and
   *  `ana@` would answer with `ana.souza@`'s name. */
  async byEmail(email: string): Promise<AuthServiceUser | null> {
    // Both sides lowercased here, not trusted to the loader: a list in mixed
    // case would answer no name, which reads as a person who has none.
    const wanted = email.trim().toLowerCase()
    const snapshot = await this.currentWithin(NAME_WAIT_MS)

    return snapshot?.users.find((user) => user.email.toLowerCase() === wanted) ?? null
  }

  /** The snapshot if it arrives within `ms`, otherwise null — the listing runs
   *  on, so whoever loads the next page finds it warm. */
  private async currentWithin(ms: number): Promise<Snapshot | null> {
    const current = this.current()
    // Outliving the race, its rejection needs an owner here as well.
    current.catch(() => undefined)

    let timer: ReturnType<typeof setTimeout> | undefined
    const capped = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms)
    })

    try {
      return await Promise.race([current, capped])
    } finally {
      clearTimeout(timer)
    }
  }

  private async current(): Promise<Snapshot> {
    const failure = this.failure
    const holdingOff = failure !== null && Date.now() < failure.retryAt
    const servable = this.within(this.maxStaleMs)

    const usable = this.within(this.ttlMs) ?? (holdingOff ? servable : null)
    if (usable) {
      return usable
    }

    // Inside the hold-off with nothing worth serving: refuse right away instead
    // of making every caller wait out the listing timeout again.
    if (holdingOff) {
      throw failure.error
    }

    const refresh = this.refresh()

    // Stale while revalidating: /api/auth/me runs through here on every page
    // load, and the session store sits in `loading` until it answers.
    if (servable) {
      refresh.catch(() => undefined)
      return servable
    }

    // Nothing usable in hand: this caller waits, and hears about it. Serving
    // stale returned above, before the await.
    return refresh
  }

  /** One listing at a time. Nothing is stored on failure, so a broken
   *  auth-service cannot pin a wrong list for the whole TTL. */
  private refresh(): Promise<Snapshot> {
    this.inFlight ??= this.load()
      .then((users) => {
        const before = this.snapshot?.users.length ?? 0

        // The upstream builds its total from what it managed to load, so a
        // listing it truncated arrives consistent with itself.
        if (users.length === 0 && before > 0) {
          throw new ServiceUnavailableError('auth-service user listing is unavailable', {
            cause: new Error('listed nobody, and there were people a moment ago'),
          })
        }

        // A first listing that is empty is cached like any other, so the queue
        // would carry no names at all for a whole TTL.
        if (users.length === 0) {
          this.logger?.warn('pipo user list: the first listing came back empty')
        }

        // Smaller than last time is either people leaving or a listing cut
        // short upstream, and from here the two look the same.
        if (users.length < before) {
          this.logger?.warn(
            { was: before, now: users.length },
            'pipo user list: fewer people than the snapshot it replaces',
          )
        }

        const snapshot = snapshotOf(users)
        this.snapshot = snapshot
        this.failure = null
        return snapshot
      })
      .catch((error: unknown) => {
        // Armed and logged here, not at the call site: the stale-while-
        // revalidate path never awaits this promise, so nobody else would.
        this.failure = { error, retryAt: Date.now() + RETRY_FLOOR_MS }
        this.logger?.warn(error, 'pipo user list: refresh failed')
        throw error
      })
      .finally(() => {
        this.inFlight = null
      })

    return this.inFlight
  }
}
