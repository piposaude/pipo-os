import { describe, expect, it } from 'vitest'
import { applyPlan, SeedRunError } from './apply.js'
import type { SeedClient } from './apply.js'
import { planSeed } from './plan.js'
import type { CurrentStructure, SeedStructure } from './plan.js'

const CLT_FILTER = { contractTypes: ['clt'], archived: false }
const CLT_SORT = { by: 'actionDate', direction: 'asc' }

const TINY: SeedStructure = {
  groups: [
    { key: 'root', name: 'Gestão de Benefícios', parentKey: null },
    { key: 'pod-1', name: 'POD 1', parentKey: 'root' },
  ],
  queues: [{ groupKey: 'pod-1', name: 'MOV CLT', filters: CLT_FILTER, sort: CLT_SORT }],
  members: [{ groupKey: 'root', userId: 'ana@piposaude.com.br', role: 'admin' }],
}

const EMPTY: CurrentStructure = { groups: [], queues: [], members: [] }

function recordingClient(): { client: SeedClient; calls: unknown[] } {
  const calls: unknown[] = []
  let next = 0
  const client: SeedClient = {
    createGroup: (body) => {
      calls.push(['createGroup', body])
      next += 1
      return Promise.resolve({ id: `id-${next}` })
    },
    createQueue: (body) => {
      calls.push(['createQueue', body])
      next += 1
      return Promise.resolve({ id: `id-${next}` })
    },
    addMember: (groupId, body) => {
      calls.push(['addMember', groupId, body])
      return Promise.resolve()
    },
  }
  return { client, calls }
}

describe('applyPlan', () => {
  it('points each node at the id the API gave to the group created a moment before', async () => {
    const { client, calls } = recordingClient()

    await applyPlan(planSeed(TINY, EMPTY), client)

    expect(calls).toEqual([
      ['createGroup', { name: 'Gestão de Benefícios', parentId: null }],
      ['createGroup', { name: 'POD 1', parentId: 'id-1' }],
      ['createQueue', { name: 'MOV CLT', groupId: 'id-2', filters: CLT_FILTER, sort: CLT_SORT }],
      ['addMember', 'id-1', { userId: 'ana@piposaude.com.br', role: 'admin' }],
    ])
  })

  it('points at the id of a group that was already there', async () => {
    const current: CurrentStructure = {
      groups: [{ id: 'g1', name: 'Gestão de Benefícios', parentId: null }],
      queues: [],
      members: [],
    }
    const { client, calls } = recordingClient()

    await applyPlan(planSeed(TINY, current), client)

    expect(calls).toEqual([
      ['createGroup', { name: 'POD 1', parentId: 'g1' }],
      ['createQueue', { name: 'MOV CLT', groupId: 'id-1', filters: CLT_FILTER, sort: CLT_SORT }],
      ['addMember', 'g1', { userId: 'ana@piposaude.com.br', role: 'admin' }],
    ])
  })

  it('carries what it had created when the API refuses in the middle', async () => {
    const { client } = recordingClient()
    const refusing: SeedClient = {
      ...client,
      createQueue: () => Promise.reject(new Error('POST /api/queues respondeu 401')),
    }

    const failure = await applyPlan(planSeed(TINY, EMPTY), refusing).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(SeedRunError)
    expect((failure as SeedRunError).created).toEqual({ groups: 2, queues: 0, members: 0 })
    expect((failure as SeedRunError).cause).toEqual(new Error('POST /api/queues respondeu 401'))
  })

  it('counts what it created, for the report', async () => {
    const { client } = recordingClient()

    const outcome = await applyPlan(planSeed(TINY, EMPTY), client)

    expect(outcome.created).toEqual({ groups: 2, queues: 1, members: 1 })
  })
})
