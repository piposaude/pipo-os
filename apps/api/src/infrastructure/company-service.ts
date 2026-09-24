import type { FastifyBaseLogger } from 'fastify'
import { z } from 'zod'
import { deadline } from '../shared/deadline.js'
import { ServiceUnavailableError } from '../shared/errors.js'

export interface Company {
  readonly id: string
  readonly name: string | null
  readonly taxId: string | null
}

export interface GetCompaniesParams {
  baseUrl: string
  /** Lowercase uuids, at most one batch of the upstream: the caller validates. */
  ids: readonly string[]
  logger?: Pick<FastifyBaseLogger, 'warn'>
}

export const COMPANIES_TIMEOUT_MS = 5_000

// Not requiredWhenDeployed: the address is fixed in the cluster, and a wrong
// one surfaces as a 503 on this route only.
export function companyServiceInternalUrl(): string {
  return process.env.COMPANY_SERVICE_INTERNAL_URL ?? 'http://company-service.default:4000'
}

// The same rules the route publishes: a row this lets through and the
// serializer refuses answers 500 for the whole list.
const companyRowSchema = z.object({
  id: z.uuid(),
  name: z.string().nullish(),
  'tax-id': z.string().nullish(),
})

function companiesUrl(baseUrl: string, ids: readonly string[]): string {
  const url = new URL('api/companies', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  // Commas as they are: the upstream splits the raw value on them.
  url.search = `ids=${ids.join(',')}`
  return url.toString()
}

export async function getCompanies({
  baseUrl,
  ids,
  logger,
}: GetCompaniesParams): Promise<Company[]> {
  if (ids.length === 0) {
    return []
  }

  // Wraps the body as well: fetch resolves on the headers.
  const call = deadline(COMPANIES_TIMEOUT_MS)

  try {
    let response: Response
    try {
      response = await fetch(companiesUrl(baseUrl, ids), { redirect: 'error', signal: call.signal })
    } catch (error) {
      throw new ServiceUnavailableError('company-service is unreachable', { cause: error })
    }

    if (!response.ok) {
      throw new ServiceUnavailableError('company-service is unavailable', {
        cause: new Error(`company-service answered ${response.status}`),
      })
    }

    let data: { companies?: unknown }
    try {
      data = (await response.json()) as { companies?: unknown }
    } catch {
      throw new ServiceUnavailableError('company-service is unavailable', {
        cause: new Error('answered a body that is not JSON'),
      })
    }

    // Read as "none of them exist", a broken contract would blank every name.
    if (!Array.isArray(data?.companies)) {
      throw new ServiceUnavailableError('company-service is unavailable', {
        cause: new Error('answered no company list'),
      })
    }

    const asked = new Set(ids)
    let dropped = 0
    const companies = data.companies.flatMap((row: unknown) => {
      const parsed = companyRowSchema.safeParse(row)
      if (!parsed.success) {
        dropped += 1
        return []
      }

      const id = parsed.data.id.toLowerCase()
      if (!asked.has(id)) {
        return []
      }

      return [{ id, name: parsed.data.name ?? null, taxId: parsed.data['tax-id'] ?? null }]
    })

    if (dropped > 0) {
      logger?.warn(
        { dropped, seen: data.companies.length },
        'company lookup: rows dropped for breaking the company-service contract',
      )
    }

    return companies
  } finally {
    call.clear()
  }
}
