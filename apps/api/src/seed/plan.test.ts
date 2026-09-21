import { describe, expect, it } from 'vitest'
import { planSeed } from './plan.js'
import type { CurrentStructure, SeedStructure } from './plan.js'

const EMPTY: CurrentStructure = { groups: [], queues: [], members: [] }

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

const applied = (overrides: Partial<CurrentStructure> = {}): CurrentStructure => ({
  groups: [
    { id: 'g1', name: 'Gestão de Benefícios', parentId: null },
    { id: 'g2', name: 'POD 1', parentId: 'g1' },
  ],
  queues: [{ id: 'q1', name: 'MOV CLT', groupId: 'g2', filters: CLT_FILTER, sort: CLT_SORT }],
  members: [{ groupId: 'g1', userId: 'ana@piposaude.com.br' }],
  ...overrides,
})

describe('planSeed', () => {
  it('plans every node of an empty environment, parents before children', () => {
    const plan = planSeed(TINY, EMPTY)

    expect(plan.actions).toEqual([
      { kind: 'create-group', key: 'root', name: 'Gestão de Benefícios', parentKey: null },
      { kind: 'create-group', key: 'pod-1', name: 'POD 1', parentKey: 'root' },
      {
        kind: 'create-queue',
        groupKey: 'pod-1',
        name: 'MOV CLT',
        filters: CLT_FILTER,
        sort: CLT_SORT,
      },
      { kind: 'add-member', groupKey: 'root', userId: 'ana@piposaude.com.br', role: 'admin' },
    ])
  })

  it('plans nothing over an environment that already carries the tree', () => {
    expect(planSeed(TINY, applied()).actions).toEqual([])
  })

  it('plans only the membership of a person added to the file later', () => {
    const withBruno: SeedStructure = {
      ...TINY,
      members: [
        ...TINY.members,
        { groupKey: 'pod-1', userId: 'bruno@piposaude.com.br', role: 'member' },
      ],
    }

    expect(planSeed(withBruno, applied()).actions).toEqual([
      { kind: 'add-member', groupKey: 'pod-1', userId: 'bruno@piposaude.com.br', role: 'member' },
    ])
  })

  it('counts what was already there, so a second run reports it instead of staying silent', () => {
    expect(planSeed(TINY, applied()).existing).toEqual({ groups: 2, queues: 1, members: 1 })
    expect(planSeed(TINY, EMPTY).existing).toEqual({ groups: 0, queues: 0, members: 0 })
  })

  it('reports a view that carries the declared name over another filter', () => {
    const current = applied({
      queues: [
        {
          id: 'q1',
          name: 'MOV CLT',
          groupId: 'g2',
          filters: { contractTypes: ['pj'], archived: false },
          sort: CLT_SORT,
        },
      ],
    })

    const plan = planSeed(TINY, current)

    expect(plan.actions).toEqual([])
    expect(plan.divergences).toEqual([
      { kind: 'queue', groupKey: 'pod-1', name: 'MOV CLT', fields: ['filters'] },
    ])
  })

  it('does not report a view whose filter is the declared one written in another key order', () => {
    const current = applied({
      queues: [
        {
          id: 'q1',
          name: 'MOV CLT',
          groupId: 'g2',
          filters: { archived: false, contractTypes: ['clt'] },
          sort: { direction: 'asc', by: 'actionDate' },
        },
      ],
    })

    expect(planSeed(TINY, current).divergences).toEqual([])
  })

  it('finds no group of the same name under a parent that is still to be created', () => {
    const elsewhere: CurrentStructure = {
      groups: [{ id: 'other', name: 'POD 1', parentId: null }],
      queues: [],
      members: [],
    }

    expect(planSeed(TINY, elsewhere).actions).toContainEqual({
      kind: 'create-group',
      key: 'pod-1',
      name: 'POD 1',
      parentKey: 'root',
    })
  })
})
