import { describe, expect, it } from 'vitest'
import { formatReport } from './report.js'

const NOTHING = { groups: 0, queues: 0, members: 0 }

describe('formatReport', () => {
  it('says what it created and what was already there', () => {
    const lines = formatReport({
      created: { groups: 7, queues: 24, members: 7 },
      existing: NOTHING,
      divergences: [],
    })

    expect(lines).toContain('criados: 7 grupos, 24 visões, 7 vínculos')
    expect(lines).toContain('já existiam: 0 grupos, 0 visões, 0 vínculos')
  })

  it('says plainly that a second run had nothing to do', () => {
    const lines = formatReport({
      created: NOTHING,
      existing: { groups: 7, queues: 24, members: 7 },
      divergences: [],
    })

    expect(lines).toContain('nada a criar: o ambiente já está com a árvore declarada')
  })

  it('names every view that matched by name but not by content', () => {
    const lines = formatReport({
      created: NOTHING,
      existing: { groups: 7, queues: 24, members: 7 },
      divergences: [{ kind: 'queue', groupKey: 'pod-3', name: 'MOV PJ', fields: ['filters'] }],
    })

    expect(lines).toContain('não casou: visão MOV PJ em pod-3 diverge em filters')
  })

  it('does not read as success when the run stopped before creating anything', () => {
    const lines = formatReport({
      created: NOTHING,
      existing: NOTHING,
      divergences: [],
      interrupted: true,
    })

    expect(lines).toContain('interrompido: criados 0 grupos, 0 visões, 0 vínculos')
    expect(lines).not.toContain('nada a criar: o ambiente já está com a árvore declarada')
  })

  it('names a membership that diverges by what it is, not as if it were a view', () => {
    const lines = formatReport({
      created: NOTHING,
      existing: { groups: 7, queues: 24, members: 7 },
      divergences: [
        { kind: 'member', groupKey: 'pod-2', name: 'ana@piposaude.com.br', fields: ['active'] },
      ],
    })

    expect(lines).toContain('não casou: vínculo de ana@piposaude.com.br em pod-2 diverge em active')
  })
})
