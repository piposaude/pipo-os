import type { SeedDivergence } from './plan.js'

interface Tally {
  groups: number
  queues: number
  members: number
}

export interface ReportInput {
  created: Tally
  existing: Tally
  divergences: SeedDivergence[]
}

const countOf = (tally: Tally): string =>
  `${tally.groups} grupos, ${tally.queues} visões, ${tally.members} vínculos`

const isEmpty = (tally: Tally): boolean =>
  tally.groups === 0 && tally.queues === 0 && tally.members === 0

export function formatReport({ created, existing, divergences }: ReportInput): string[] {
  const lines = isEmpty(created)
    ? ['nada a criar: o ambiente já está com a árvore declarada']
    : [`criados: ${countOf(created)}`]

  lines.push(`já existiam: ${countOf(existing)}`)

  for (const divergence of divergences) {
    lines.push(
      `não casou: visão ${divergence.name} em ${divergence.groupKey} diverge em ${divergence.fields.join(', ')}`,
    )
  }

  return lines
}
