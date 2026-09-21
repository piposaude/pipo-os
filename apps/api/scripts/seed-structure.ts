import { applyPlan, SeedRunError, type SeedClient } from '../src/seed/apply.js'
import { planSeed } from '../src/seed/plan.js'
import { readCurrent, type SeedReader } from '../src/seed/read.js'
import { formatReport } from '../src/seed/report.js'
import { PIPODESK_STRUCTURE } from '../src/seed/structure.js'

const BASE_URL = (process.env.PIPO_OS_URL ?? 'http://localhost:3001').replace(/\/$/, '')
const SESSION_COOKIE_NAME = 'pipo_os_session'
const STRUCTURE_POLICY = 'admin/allow/administrate/pipodesk/*'

async function devLoginCookie(): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ policies: [STRUCTURE_POLICY] }),
  })

  if (!response.ok) {
    throw new Error(
      `dev-login respondeu ${response.status}. Fora do localhost, passe PIPO_OS_SESSION com o cookie ${SESSION_COOKIE_NAME} do navegador.`,
    )
  }

  const cookie = response.headers
    .getSetCookie()
    .find((header) => header.startsWith(`${SESSION_COOKIE_NAME}=`))

  if (!cookie) {
    throw new Error('dev-login não devolveu cookie de sessão')
  }
  return cookie.split(';')[0].slice(SESSION_COOKIE_NAME.length + 1)
}

async function resolveSession(): Promise<string> {
  const given = process.env.PIPO_OS_SESSION?.trim()
  return given ? given : devLoginCookie()
}

function apiOf(session: string) {
  return async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        cookie: `${SESSION_COOKIE_NAME}=${session}`,
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
    })

    if (!response.ok) {
      throw new Error(
        `${init.method ?? 'GET'} ${path} respondeu ${response.status}: ${await response.text()}`,
      )
    }
    return response.status === 204 ? (null as T) : ((await response.json()) as T)
  }
}

async function main(): Promise<void> {
  const session = await resolveSession()
  const call = apiOf(session)

  const reader: SeedReader = {
    listGroups: (page, pageSize) => call(`/api/groups?page=${page}&pageSize=${pageSize}`),
    listQueues: (page, pageSize) => call(`/api/queues?page=${page}&pageSize=${pageSize}`),
  }

  const client: SeedClient = {
    createGroup: (body) => call('/api/groups', { method: 'POST', body: JSON.stringify(body) }),
    createQueue: (body) => call('/api/queues', { method: 'POST', body: JSON.stringify(body) }),
    addMember: (groupId, body) =>
      call(`/api/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify(body) }),
  }

  const current = await readCurrent(reader)
  const plan = planSeed(PIPODESK_STRUCTURE, current)

  const print = (created: { groups: number; queues: number; members: number }): void => {
    console.log(`seed da estrutura do Pipodesk em ${BASE_URL}`)
    for (const line of formatReport({
      created,
      existing: plan.existing,
      divergences: plan.divergences,
    })) {
      console.log(`  ${line}`)
    }
  }

  try {
    print((await applyPlan(plan, client)).created)
  } catch (error) {
    if (error instanceof SeedRunError) {
      print(error.created)
    }
    throw error
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
