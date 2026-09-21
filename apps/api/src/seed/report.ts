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
  interrupted?: boolean
}

const countOf = (tally: Tally): string =>
  `${tally.groups} grupos, ${tally.queues} visões, ${tally.members} vínculos`

const isEmpty = (tally: Tally): boolean =>
  tally.groups === 0 && tally.queues === 0 && tally.members === 0

export function formatReport({
  created,
  existing,
  divergences,
  interrupted,
}: ReportInput): string[] {
  const headline = (): string => {
    if (interrupted) return `interrompido: criados ${countOf(created)}`
    if (!isEmpty(created)) return `criados: ${countOf(created)}`
    return divergences.length === 0
      ? 'nada a criar: o ambiente já está com a árvore declarada'
      : 'nada a criar, mas o ambiente diverge do que está declarado'
  }

  const lines = [headline()]

  lines.push(`já existiam: ${countOf(existing)}`)

  for (const divergence of divergences) {
    const what =
      divergence.kind === 'queue' ? `visão ${divergence.name}` : `vínculo de ${divergence.name}`
    lines.push(
      `não casou: ${what} em ${divergence.groupKey} diverge em ${divergence.fields.join(', ')}`,
    )
  }

  return lines
}
