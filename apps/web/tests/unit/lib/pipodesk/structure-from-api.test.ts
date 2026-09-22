import { describe, expect, it } from 'vitest'
import { structureFromApi } from '@/lib/pipodesk/structure-from-api'
import type { ApiGroup, ApiQueue } from '@/lib/pipodesk/structure-from-api'

const ROOT: ApiGroup = {
  id: 'g-root',
  name: 'Gestão de Benefícios',
  parentId: null,
  companyIds: [],
  members: [{ userId: 'ana@piposaude.com.br', role: 'admin', active: true, companyIds: [] }],
}

const POD: ApiGroup = {
  id: 'g-pod-1',
  name: 'POD 1',
  parentId: 'g-root',
  companyIds: ['c-1'],
  members: [
    { userId: 'bruno@piposaude.com.br', role: 'member', active: true, companyIds: [] },
    { userId: 'carla@piposaude.com.br', role: 'member', active: false, companyIds: [] },
  ],
}

const queue = (overrides: Partial<ApiQueue> = {}): ApiQueue => ({
  id: 'q-1',
  name: 'MOV CLT',
  groupId: 'g-pod-1',
  ownerId: null,
  filters: { contractTypes: ['clt'], archived: false },
  sort: { by: 'actionDate', direction: 'asc' },
  groupBy: null,
  favorite: false,
  ...overrides,
})

describe('structureFromApi', () => {
  it('should carregar grupos e carteira como a árvore espera', () => {
    const structure = structureFromApi([ROOT, POD], [], 'ana@piposaude.com.br')

    expect(structure.groups).toEqual([
      { id: 'g-root', name: 'Gestão de Benefícios', parentId: null, companyIds: [] },
      { id: 'g-pod-1', name: 'POD 1', parentId: 'g-root', companyIds: ['c-1'] },
    ])
  })

  it('should tirar os vínculos de dentro dos grupos, que é onde a API os carrega', () => {
    const structure = structureFromApi([ROOT, POD], [], 'ana@piposaude.com.br')

    expect(structure.memberships).toEqual([
      { userId: 'ana@piposaude.com.br', groupId: 'g-root', role: 'admin', companyIds: [] },
      { userId: 'bruno@piposaude.com.br', groupId: 'g-pod-1', role: 'member', companyIds: [] },
    ])
  })

  it('should deixar de fora o vínculo desativado, que a sessão também não enxerga', () => {
    const structure = structureFromApi([POD], [], 'ana@piposaude.com.br')

    expect(structure.memberships.map((m) => m.userId)).not.toContain('carla@piposaude.com.br')
  })

  it('should virar a estrela do viewer em assinatura, que é como o web modela favorito', () => {
    const structure = structureFromApi(
      [POD],
      [queue({ favorite: true }), queue({ id: 'q-2', name: 'MOV PJ', favorite: false })],
      'ana@piposaude.com.br',
    )

    expect(structure.queues[0].subscriberIds).toEqual(['ana@piposaude.com.br'])
    expect(structure.queues[1].subscriberIds).toEqual([])
  })

  it('should descartar a visão sem grupo, que não tem onde aparecer na árvore', () => {
    const structure = structureFromApi([POD], [queue({ groupId: null })], 'ana@piposaude.com.br')

    expect(structure.queues).toEqual([])
  })

  it('should descartar a visão cujo filtro esta versão não sabe ler', () => {
    const structure = structureFromApi([POD], [queue({ filters: null })], 'ana@piposaude.com.br')

    expect(structure.queues).toEqual([])
  })
})
