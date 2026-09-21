import { describe, expect, it } from 'vitest'
import { readCurrent } from './read.js'
import type { SeedReader } from './read.js'

const QUEUE_SORT = { by: 'actionDate', direction: 'asc' }

function readerOf(groupPages: unknown[][], queuePages: unknown[][] = [[]]): SeedReader {
  const pageOf = (pages: unknown[][], page: number) => ({
    data: (pages[page - 1] ?? []) as never,
    total: pages.flat().length,
  })
  return {
    listGroups: (page) => Promise.resolve(pageOf(groupPages, page)),
    listQueues: (page) => Promise.resolve(pageOf(queuePages, page)),
  }
}

describe('readCurrent', () => {
  it('drains every page, because a child whose parent was left out reads as missing', async () => {
    const reader = readerOf([
      [{ id: 'g1', name: 'Gestão de Benefícios', parentId: null, members: [] }],
      [{ id: 'g2', name: 'POD 1', parentId: 'g1', members: [] }],
    ])

    const current = await readCurrent(reader, 1)

    expect(current.groups).toEqual([
      { id: 'g1', name: 'Gestão de Benefícios', parentId: null },
      { id: 'g2', name: 'POD 1', parentId: 'g1' },
    ])
  })

  it('takes the memberships from the groups, which is where the API carries them', async () => {
    const reader = readerOf([
      [
        {
          id: 'g1',
          name: 'Gestão de Benefícios',
          parentId: null,
          members: [
            { userId: 'ana@piposaude.com.br', role: 'admin', active: true, companyIds: [] },
            { userId: 'bruno@piposaude.com.br', role: 'member', active: true, companyIds: [] },
          ],
        },
      ],
    ])

    const current = await readCurrent(reader, 20)

    expect(current.members).toEqual([
      { groupId: 'g1', userId: 'ana@piposaude.com.br', role: 'admin', active: true },
      { groupId: 'g1', userId: 'bruno@piposaude.com.br', role: 'member', active: true },
    ])
  })

  it('keeps the filter and the sort of each view, so a divergence can be seen', async () => {
    const reader = readerOf(
      [[]],
      [
        [
          {
            id: 'q1',
            name: 'MOV CLT',
            groupId: 'g2',
            ownerId: null,
            filters: { archived: false },
            sort: QUEUE_SORT,
          },
        ],
      ],
    )

    const current = await readCurrent(reader, 20)

    expect(current.queues).toEqual([
      {
        id: 'q1',
        name: 'MOV CLT',
        groupId: 'g2',
        ownerId: null,
        filters: { archived: false },
        sort: QUEUE_SORT,
      },
    ])
  })
})
