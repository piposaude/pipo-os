import type { SeedGroup, SeedMember, SeedQueue, SeedStructure } from './plan.js'

const ROOT_KEY = 'geben'

const POD_COUNT = 6

const SEED_MEMBERS = ['olavo.souza@piposaude.com.br']

export const POD_VIEW_NAMES = ['Meus e livres', 'MOV CLT', 'MOV PJ', 'MOV MB'] as const

const MB_PRODUCTS = ['life', 'pharmacy', 'gym', 'pet']

const podViews = (groupKey: string): SeedQueue[] => [
  {
    groupKey,
    name: 'Meus e livres',
    filters: { assigneeIds: ['@me', null], archived: false },
    sort: { by: 'actionDate', direction: 'asc' },
  },
  {
    groupKey,
    name: 'MOV CLT',
    filters: { contractTypes: ['clt'], archived: false },
    sort: { by: 'actionDate', direction: 'asc' },
  },
  {
    groupKey,
    name: 'MOV PJ',
    filters: { contractTypes: ['pj'], archived: false },
    sort: { by: 'actionDate', direction: 'asc' },
  },
  {
    groupKey,
    name: 'MOV MB',
    filters: { products: MB_PRODUCTS, archived: false },
    sort: { by: 'updatedAt', direction: 'desc' },
  },
]

const podKeys = Array.from({ length: POD_COUNT }, (_, index) => `pod-${index + 1}`)

const groups: SeedGroup[] = [
  { key: ROOT_KEY, name: 'Gestão de Benefícios', parentKey: null },
  ...podKeys.map((key, index) => ({
    key,
    name: `POD ${index + 1}`,
    parentKey: ROOT_KEY,
  })),
]

const members: SeedMember[] = groups.flatMap((group) =>
  SEED_MEMBERS.map((userId) => ({ groupKey: group.key, userId, role: 'admin' as const })),
)

export const PIPODESK_STRUCTURE: SeedStructure = {
  groups,
  queues: podKeys.flatMap(podViews),
  members,
}
