import { readFile } from 'node:fs/promises'
import type { FastifyBaseLogger } from 'fastify'
import { ServiceUnavailableError } from '../shared/errors.js'
import { assertNotSetInDeployed } from '../shared/environment.js'
import { isEmail } from '../shared/schemas.js'

/** A person as the Pipodesk needs them: the e-mail is the join key, because it
 *  is what the `sub` of the access-token writes into every author column. */
export interface AuthServiceUser {
  // Readonly because the snapshot behind them is shared: every caller of
  // UsersService.list reads the same objects for the whole TTL.
  readonly email: string
  readonly name: string | null
}

export interface ListPipoUsersParams {
  baseUrl: string
  logger?: Pick<FastifyBaseLogger, 'warn'>
}

// Not the `aws-iam-token` mounted next to it: that one is IRSA, with the AWS
// audience, and the auth-service does not know it.
const SERVICE_ACCOUNT_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token'

// The upstream's own maximum.
const PAGE_SIZE = 100

/** Bounds a listing that a broken cursor could otherwise make endless. At 100
 *  per page this is 5.000 people — far past the size the Pipo has. */
export const MAX_PAGES = 50

/** Crossing MAX_PAGES fails the listing rather than truncating it, so the
 *  growth that gets there has to be readable before it becomes a 503. */
export const PAGES_WARNING_AT = 30

/** One budget for the whole listing: fifty pages of five seconds each would hold
 *  /api/auth/me open for minutes. */
export const LISTING_TIMEOUT_MS = 15_000

/** And one per page, so a single hung request does not eat the whole budget. */
export const PAGE_TIMEOUT_MS = 5_000

/** AbortSignal.timeout is driven by a timer the test runner cannot advance, so
 *  the deadline would be unobservable — and untested. */
function deadline(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${ms}ms`)), ms)

  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

/** A pasted token never rotates, and the identity behind it can attach any
 *  policy to any identity — so a deployed environment must not boot with one. */
export function assertServiceTokenIsLocalOnly(): void {
  if (!process.env.SERVICE_ACCOUNT_TOKEN?.trim()) {
    return
  }

  assertNotSetInDeployed('SERVICE_ACCOUNT_TOKEN')
}

// Read on every call, never cached: the kubelet rotates the projected token, so
// a copy taken at boot stops working within hours.
async function serviceAccountToken(): Promise<string> {
  const fromEnv = process.env.SERVICE_ACCOUNT_TOKEN?.trim()
  if (fromEnv) {
    return fromEnv
  }

  try {
    const fromFile = (await readFile(SERVICE_ACCOUNT_TOKEN_PATH, 'utf-8')).trim()
    if (!fromFile) {
      throw new Error('service account token file is empty')
    }
    return fromFile
  } catch (error) {
    throw new ServiceUnavailableError('No service account token to reach the auth-service', {
      cause: error,
    })
  }
}

interface ListUsersResponse {
  users?: unknown
  total?: unknown
  'next-cursor'?: unknown
}

function pageUrl(baseUrl: string, cursor: string | null): string {
  // Relative, with the base ending in a slash: an absolute path would throw away
  // a prefix like `/auth` if the address ever carries one.
  const url = new URL('api/users', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  url.searchParams.set('email-type', 'pipo-email')
  url.searchParams.set('limit', String(PAGE_SIZE))
  if (cursor) {
    url.searchParams.set('cursor', cursor)
  }
  return url.toString()
}

interface DirectoryPage {
  rows: AuthServiceUser[]
  seen: number
  dropped: number
}

/** A 200 whose body is not the contract is the auth-service breaking it, and
 *  reading that as an empty page would publish "the Pipo has nobody". */
function pageOf(data: ListUsersResponse): DirectoryPage {
  if (!Array.isArray(data.users)) {
    throw new ServiceUnavailableError('auth-service user listing is unavailable')
  }

  const rows = (data.users as Array<{ email?: unknown; name?: unknown } | null>).flatMap((user) => {
    // The same rule the response publishes, not a second one: a row this lets
    // through and the serializer refuses answers 500 for the whole page.
    if (!isEmail(user?.email)) {
      return []
    }

    // Lowercased on the way in: this is the key the ticket columns are joined
    // by, and the join is case sensitive.
    return [
      {
        email: user.email.toLowerCase(),
        name: typeof user?.name === 'string' ? user.name : null,
      },
    ]
  })

  return { rows, seen: data.users.length, dropped: data.users.length - rows.length }
}

/** A refusal here is ours, not the caller's: the policy upstream belongs to this
 *  service's identity, so nothing of theirs — status included — is published. */
export async function listPipoUsers({
  baseUrl,
  logger,
}: ListPipoUsersParams): Promise<AuthServiceUser[]> {
  const token = await serviceAccountToken()
  const listing = deadline(LISTING_TIMEOUT_MS)
  // Keyed by e-mail: the upstream cursor is an offset over a snapshot it holds
  // for 60 s, so a listing that crosses that line reads shifted pages.
  const users = new Map<string, AuthServiceUser>()
  let expectedTotal: number | null = null
  let seen = 0
  let dropped = 0
  let cursor: string | null = null

  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      // Wraps the whole iteration: fetch resolves on the headers, and a body
      // that trickles in afterwards would escape the page deadline.
      const attempt = deadline(PAGE_TIMEOUT_MS)

      try {
        let response: Response

        try {
          response = await fetch(pageUrl(baseUrl, cursor), {
            headers: { authorization: `Bearer ${token}` },
            redirect: 'error',
            signal: AbortSignal.any([listing.signal, attempt.signal]),
          })
        } catch (error) {
          throw new ServiceUnavailableError('auth-service user listing is unreachable', {
            cause: error,
          })
        }

        if (!response.ok) {
          throw new ServiceUnavailableError('auth-service user listing is unavailable', {
            cause: new Error(`auth-service user listing answered ${response.status}`),
          })
        }

        let data: ListUsersResponse
        try {
          data = (await response.json()) as ListUsersResponse
        } catch {
          // The parser's own message quotes the body, which here is people's
          // names and e-mails, and `cause` reaches the log.
          throw new ServiceUnavailableError('auth-service user listing is unavailable', {
            cause: new Error('answered a body that is not JSON'),
          })
        }

        const batch = pageOf(data)
        seen += batch.seen
        dropped += batch.dropped

        for (const user of batch.rows) {
          users.set(user.email, user)
        }

        const total = data.total
        // A count that is not a whole number of people disarms both checks
        // below: read as absent by one, never reached by the other.
        if (
          total !== null &&
          total !== undefined &&
          (typeof total !== 'number' || !Number.isInteger(total) || total < 0)
        ) {
          throw new ServiceUnavailableError('auth-service user listing is unavailable', {
            // The type, or the number itself — never the value, which comes
            // from a body that carries people's names and e-mails.
            cause: new Error(
              `listing answered a total that is not a count of people (${typeof total === 'number' ? total : typeof total})`,
            ),
          })
        }

        // Only shrinking skips people; growing repeats them, and the map above
        // absorbs that. Size is no witness to order, so a rename still slips.
        if (typeof total === 'number') {
          if (expectedTotal !== null && total < expectedTotal) {
            throw new ServiceUnavailableError('auth-service user listing is unavailable', {
              cause: new Error(
                `listing shrank under the cursor: ${expectedTotal} people became ${total}`,
              ),
            })
          }
          expectedTotal = total
        }

        const next = data['next-cursor']
        if (next === null || next === undefined) {
          // Upstream omits the cursor only once offset + page >= total, so
          // ending short of its own count means the pages stopped early.
          if (expectedTotal !== null && seen < expectedTotal) {
            throw new ServiceUnavailableError('auth-service user listing is unavailable', {
              cause: new Error(`listing ended after ${seen} of ${expectedTotal} people`),
            })
          }

          // Rows can cover the total while distinct people do not: a snapshot
          // rebuilt mid-drain repeats someone and skips someone else.
          if (expectedTotal !== null && users.size + dropped < expectedTotal) {
            logger?.warn(
              { kept: users.size, dropped, total: expectedTotal },
              'pipo user list: fewer people than the listing counted, so a page repeated someone',
            )
          }

          return [...users.values()]
        }

        // A cursor that is there but cannot be followed — another type, or the
        // empty string — is the contract broken, not the end of the pages.
        if (typeof next !== 'string' || next === '') {
          throw new ServiceUnavailableError('auth-service user listing is unavailable', {
            cause: new Error(`listing answered a cursor that cannot be followed (${typeof next})`),
          })
        }
        cursor = next

        if (page + 1 === PAGES_WARNING_AT) {
          logger?.warn(
            { pages: PAGES_WARNING_AT, kept: users.size, maxPages: MAX_PAGES },
            `pipo user list: nearing the ${MAX_PAGES} page ceiling, past which it stops answering at all`,
          )
        }
      } finally {
        attempt.clear()
      }
    }
  } finally {
    listing.clear()

    // A dropped row is a person the queue renders without a name and the
    // assignee picker never offers. A repeated one is not: the map absorbs it.
    if (dropped > 0) {
      try {
        logger?.warn(
          { dropped, seen, kept: users.size },
          'pipo user list: rows dropped for an e-mail the contract refuses',
        )
      } catch {
        // A failing logger must not replace the error on its way out.
      }
    }
  }

  // Returning what was drained would hand a truncated list to a cache that
  // keeps it for minutes, with nobody able to tell it apart from a complete one.
  throw new ServiceUnavailableError('auth-service user listing is unavailable', {
    cause: new Error(`listing did not finish within ${MAX_PAGES} pages`),
  })
}
