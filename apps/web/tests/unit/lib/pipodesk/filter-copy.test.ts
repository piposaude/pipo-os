// @vitest-environment node
import {
  DATE_WINDOWS,
  FILTER_FIELDS,
  FILTER_FIELD_COPY,
  filterChipsOf,
  optionLabel,
  type LabelContext,
} from '@/lib/pipodesk/filter-copy'

const ctx: LabelContext = {
  companyName: (id) => (id === 'empresa-1' ? 'Caiçara Metalurgia' : id),
  carrierName: (id) => (id === 'sulamerica' ? 'SulAmérica' : id),
  userName: (id) => (id === 'ana@pipo' ? 'Ana Beatriz' : id),
}

describe('FILTER_FIELDS', () => {
  /** Derived from the copy table, not a second list — the prototype's stale
   *  fourth copy cost a missing chip. */
  it('should be derived from the copy table, statuses first', () => {
    expect(FILTER_FIELDS[0]).toBe('statuses')
    expect(FILTER_FIELDS[1]).toBe('priorities')
    expect(FILTER_FIELDS).toHaveLength(Object.keys(FILTER_FIELD_COPY).length)
  })
})

describe('optionLabel', () => {
  /** A filter value comes from the URL, which is hand-editable: a status the
   *  API does not know must read as itself, not crash the chip row. */
  it('should show an unknown status as it came, instead of breaking the chip', () => {
    expect(optionLabel('statuses', 'inventado', ctx)).toBe('inventado')
  })
  it('should show names, never raw ids', () => {
    expect(optionLabel('companyIds', 'empresa-1', ctx)).toBe('Caiçara Metalurgia')
    expect(optionLabel('carrierIds', 'sulamerica', ctx)).toBe('SulAmérica')
    expect(optionLabel('assigneeIds', 'ana@pipo', ctx)).toBe('Ana Beatriz')
  })

  it('should translate the domain values through the same copy the columns use', () => {
    expect(optionLabel('statuses', 'missing-documents', ctx)).toBe(
      'Com o cliente · Falta documento',
    )
    expect(optionLabel('types', 'inclusion', ctx)).toBe('Inclusão')
    expect(optionLabel('contractTypes', 'pj', ctx)).toBe('PJ')
  })

  /** Each field's null has its own name — no "Prioridade é Livre no pod". */
  it('should resolve null with the sentinel of that field', () => {
    expect(optionLabel('assigneeIds', null, ctx)).toBe('Livre no pod')
    expect(optionLabel('priorities', null, ctx)).toBe('Sem prioridade')
  })

  it('should never leak the @me token to the screen', () => {
    expect(optionLabel('assigneeIds', '@me', ctx)).toBe('você')
  })
})

describe('filterChipsOf', () => {
  it('should only chip what the person added on top of the node', () => {
    const chips = filterChipsOf(
      { assigneeIds: ['@me'], products: ['health'] },
      { assigneeIds: ['@me'] },
      ctx,
    )

    expect(chips).toEqual([{ field: 'products', text: 'Produto é Saúde' }])
  })

  /** Same values in another order (a hand-built URL) are the same filter — a
   *  positional compare invented a chip nobody added. */
  it('should not chip the node filter when the values arrive in another order', () => {
    const chips = filterChipsOf(
      { statuses: ['incorrect-data', 'missing-documents'] },
      { statuses: ['missing-documents', 'incorrect-data'] },
      ctx,
    )

    expect(chips).toEqual([])
  })

  it('should read as a sentence, joining two values with "ou" and folding more', () => {
    const dois = filterChipsOf({ types: ['inclusion', 'exclusion'] }, {}, ctx)
    expect(dois[0].text).toBe('Tipo é Inclusão ou Exclusão')

    const tres = filterChipsOf({ types: ['inclusion', 'exclusion', 'plan_change'] }, {}, ctx)
    expect(tres[0].text).toBe('Tipo é Inclusão e mais 2')
  })

  /** A single null value drops the field name — the label is the sentence. */
  it('should drop the field name when the only value is the null sentinel', () => {
    const chips = filterChipsOf({ priorities: [null] }, {}, ctx)

    expect(chips[0].text).toBe('Sem prioridade')
  })
})

describe('DATE_WINDOWS', () => {
  it('should stop at the window that still cuts something', () => {
    expect(DATE_WINDOWS.map((window) => window.days)).toEqual([7, 30, null])
  })
})
