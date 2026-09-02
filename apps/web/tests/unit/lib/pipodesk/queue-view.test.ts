// @vitest-environment node
import { NULL_TOKEN } from '@/lib/pipodesk/filter'
import {
  INITIAL_VIEW,
  fromSearch,
  queueViewReducer,
  toSearch,
  type QueueNode,
  type QueueView,
} from '@/lib/pipodesk/queue-view'

const node = (overrides: Partial<QueueNode> & { id: string }): QueueNode => ({
  label: 'Nó',
  filter: {},
  groupId: null,
  windowMode: 'awake',
  labelPath: ['Nó'],
  sort: { by: 'actionDate', direction: 'asc' },
  ...overrides,
})

describe('INITIAL_VIEW', () => {
  it('should open on the tickets assigned to the viewer, awake, ungrouped', () => {
    expect(INITIAL_VIEW.nodeId).toBe('meus-tickets')
    expect(INITIAL_VIEW.nodeFilter).toEqual({ assigneeIds: ['@me'] })
    expect(INITIAL_VIEW.windowMode).toBe('awake')
    expect(INITIAL_VIEW.groupBy).toBe('none')
    expect(INITIAL_VIEW.sort).toEqual({ by: 'actionDate', direction: 'asc' })
  })

  /** 30-day window on by default, like the prototype — a measured cost, not an
   *  accident. */
  it('should open with the 30-day window on', () => {
    expect(INITIAL_VIEW.dateWindowDays).toBe(30)
  })
})

describe('queueViewReducer — janela de abertura', () => {
  /** The window is the viewer's preference, not node state: switching queues
   *  must not erase it. */
  it('should keep the window across node switches', () => {
    const semJanela = queueViewReducer(INITIAL_VIEW, {
      type: 'set-date-window',
      days: null,
      today: '2026-08-07',
    })
    const next = queueViewReducer(semJanela, { type: 'select-node', node: node({ id: 'outro' }) })

    expect(next.dateWindowDays).toBeNull()
  })

  /** The window never bakes into the filter — the screen applies it on the
   *  base; as a chip its × would return the whole period. */
  it('should not bake the window into the filter', () => {
    const next = queueViewReducer(INITIAL_VIEW, {
      type: 'set-date-window',
      days: 7,
      today: '2026-08-07',
    })

    expect(next.dateWindowDays).toBe(7)
    expect(next.filter.createdSince).toBeUndefined()
  })

  it('should clear the selection when the window changes — selected rows may have left the screen', () => {
    const comSelecao = queueViewReducer(INITIAL_VIEW, { type: 'set-selection', ids: ['t-1'] })
    const next = queueViewReducer(comSelecao, {
      type: 'set-date-window',
      days: null,
      today: '2026-08-07',
    })

    expect(next.selectedIds).toEqual([])
  })
})

describe('queueViewReducer — select-node', () => {
  it('should adopt the filter, scope, window and breadcrumb of the node', () => {
    const next = queueViewReducer(INITIAL_VIEW, {
      type: 'select-node',
      node: node({
        id: 'pod-5-livres',
        label: 'Livres',
        filter: { assigneeIds: [null] },
        groupId: 'pod-5',
        windowMode: 'awake',
        labelPath: ['GEBEN', 'POD 5', 'Livres'],
      }),
    })

    expect(next.nodeId).toBe('pod-5-livres')
    expect(next.groupId).toBe('pod-5')
    expect(next.nodeFilter).toEqual({ assigneeIds: [null] })
    expect(next.filter).toEqual({ assigneeIds: [null] })
    expect(next.labelPath).toEqual(['GEBEN', 'POD 5', 'Livres'])
  })

  it('should drop the filters the person had added, since the node brings its own', () => {
    const withChip = queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'products',
      values: ['life'],
    })
    const next = queueViewReducer(withChip, { type: 'select-node', node: node({ id: 'outro' }) })

    expect(next.filter.products).toBeUndefined()
  })

  /** The node carries its own sort (GEBEN by last touch, triage oldest-first).
   *  Without adopting it, switching queues kept the previous order. */
  it('should adopt the sort the node declares', () => {
    const next = queueViewReducer(INITIAL_VIEW, {
      type: 'select-node',
      node: node({ id: 'node-geben', sort: { by: 'updatedAt', direction: 'desc' } }),
    })

    expect(next.sort).toEqual({ by: 'updatedAt', direction: 'desc' })
  })

  it('should adopt the grouping only when the node imposes one, keeping the choice otherwise', () => {
    const chosen = queueViewReducer(INITIAL_VIEW, { type: 'set-group-by', groupBy: 'status' })

    const semImposicao = queueViewReducer(chosen, {
      type: 'select-node',
      node: node({ id: 'node-novos' }),
    })
    expect(semImposicao.groupBy).toBe('status')

    const comImposicao = queueViewReducer(chosen, {
      type: 'select-node',
      node: node({ id: 'node-futuras', groupBy: 'none' }),
    })
    expect(comImposicao.groupBy).toBe('none')
  })

  it('should clear the selection, because the selected tickets may not be in the new queue', () => {
    const withSelection = queueViewReducer(INITIAL_VIEW, { type: 'set-selection', ids: ['t-1'] })
    const next = queueViewReducer(withSelection, {
      type: 'select-node',
      node: node({ id: 'outro' }),
    })

    expect(next.selectedIds).toEqual([])
  })
})

describe('queueViewReducer — filtros', () => {
  it('should add a field on top of the node filter without touching it', () => {
    const next = queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'products',
      values: ['life', 'health'],
    })

    expect(next.filter.products).toEqual(['life', 'health'])
    expect(next.filter.assigneeIds).toEqual(['@me'])
    expect(next.nodeFilter).toEqual({ assigneeIds: ['@me'] })
  })

  it('should remove only the field the person added, restoring what the node asked for', () => {
    const withChip = queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'products',
      values: ['life'],
    })
    const next = queueViewReducer(withChip, { type: 'remove-filter', field: 'products' })

    expect(next.filter).toEqual({ assigneeIds: ['@me'] })
  })

  it('should translate the reserved null token when writing the filter', () => {
    const next = queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'assigneeIds',
      values: [NULL_TOKEN, 'ana@pipo.health'],
    })

    expect(next.filter.assigneeIds).toEqual([null, 'ana@pipo.health'])
  })

  /** The window is not a filter: clearing chips must not silently widen the
   *  queue from 30 days to the whole history. */
  it('should keep the opening window when the filters are cleared', () => {
    const dirty = queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'products',
      values: ['life'],
    })

    const next = queueViewReducer(dirty, { type: 'clear-filters' })

    expect(next.dateWindowDays).toBe(30)
  })

  it('should clear every added filter and keep the node filter', () => {
    const dirty = queueViewReducer(
      queueViewReducer(INITIAL_VIEW, { type: 'add-filter', field: 'products', values: ['life'] }),
      { type: 'add-filter', field: 'portes', values: ['pme'] },
    )
    const next = queueViewReducer(dirty, { type: 'clear-filters' })

    expect(next.filter).toEqual({ assigneeIds: ['@me'] })
  })

  it('should drop createdSince when the window is set to the whole period', () => {
    const withWindow = queueViewReducer(INITIAL_VIEW, {
      type: 'set-date-window',
      days: 7,
      today: '2026-08-31',
    })
    const next = queueViewReducer(withWindow, {
      type: 'set-date-window',
      days: null,
      today: '2026-08-31',
    })

    expect(next.filter.createdSince).toBeUndefined()
    expect(next.dateWindowDays).toBeNull()
  })
})

describe('queueViewReducer — exibição', () => {
  it('should set sort and group by', () => {
    const sorted = queueViewReducer(INITIAL_VIEW, {
      type: 'set-sort',
      sort: { by: 'company', direction: 'desc' },
    })
    const grouped = queueViewReducer(sorted, { type: 'set-group-by', groupBy: 'status' })

    expect(grouped.sort).toEqual({ by: 'company', direction: 'desc' })
    expect(grouped.groupBy).toBe('status')
  })

  it('should toggle a collapsed group', () => {
    const collapsed = queueViewReducer(INITIAL_VIEW, {
      type: 'toggle-group',
      key: 'client-pending',
    })
    expect(collapsed.collapsedGroups).toEqual(['client-pending'])

    const expanded = queueViewReducer(collapsed, { type: 'toggle-group', key: 'client-pending' })
    expect(expanded.collapsedGroups).toEqual([])
  })
})

describe('queueViewReducer — seleção', () => {
  it('should toggle, replace and clear the selection', () => {
    const one = queueViewReducer(INITIAL_VIEW, { type: 'toggle-ticket', id: 't-1' })
    expect(one.selectedIds).toEqual(['t-1'])

    const none = queueViewReducer(one, { type: 'toggle-ticket', id: 't-1' })
    expect(none.selectedIds).toEqual([])

    const many = queueViewReducer(INITIAL_VIEW, { type: 'set-selection', ids: ['a', 'b'] })
    expect(many.selectedIds).toEqual(['a', 'b'])

    expect(queueViewReducer(many, { type: 'clear-selection' }).selectedIds).toEqual([])
  })
})

describe('URL round trip', () => {
  const views: QueueView[] = [
    INITIAL_VIEW,
    queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'products',
      values: ['life', 'health'],
    }),
    queueViewReducer(
      queueViewReducer(INITIAL_VIEW, {
        type: 'set-sort',
        sort: { by: 'company', direction: 'desc' },
      }),
      { type: 'set-group-by', groupBy: 'status' },
    ),
    queueViewReducer(INITIAL_VIEW, { type: 'set-date-window', days: 30, today: '2026-08-31' }),
    queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'assigneeIds',
      values: [NULL_TOKEN],
    }),
    queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'priorities',
      values: [NULL_TOKEN, 'urgent'],
    }),
    queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'contractTypes',
      values: [NULL_TOKEN, 'pj'],
    }),
    // Tags are free API strings — the codec's own separators must survive.
    queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'tags',
      values: ['a,b', 'c;d:e', '100%'],
    }),
  ]

  it('should survive a round trip through the search params', () => {
    for (const view of views) {
      const restored = fromSearch(toSearch(view), {
        nodeId: view.nodeId,
        label: view.label,
        filter: view.nodeFilter,
        groupId: view.groupId,
        windowMode: view.windowMode,
        labelPath: view.labelPath,
        sort: { by: 'actionDate', direction: 'asc' },
        today: '2026-08-31',
      })

      expect(restored).toEqual(view)
    }
  })

  /**
   * The token that stands for `null` used to be a plain word (`sem`, `livre`),
   * living in the same space as real values: a contract type actually called
   * `sem` decoded as "no contract", so a shared link reopened on a different
   * filter. The reserved token cannot be confused with data.
   */
  it('should keep a real value that looks like the null token', () => {
    const view = queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'contractTypes',
      values: ['sem', 'livre', 'pj'],
    })

    expect(view.filter.contractTypes).toEqual(['sem', 'livre', 'pj'])

    const restored = fromSearch(toSearch(view), {
      nodeId: view.nodeId,
      label: view.label,
      filter: view.nodeFilter,
      groupId: view.groupId,
      windowMode: view.windowMode,
      labelPath: view.labelPath,
      sort: { by: 'actionDate', direction: 'asc' },
      today: '2026-08-31',
    })

    expect(restored.filter.contractTypes).toEqual(['sem', 'livre', 'pj'])
  })

  /** A link without `sort` means "sort like this node", not the app default —
   *  a pasted link must open like a tree click. */
  it('should fall back to the sort and grouping of the node, not to the global default', () => {
    const restored = fromSearch(
      { node: 'node-geben' },
      {
        nodeId: 'node-geben',
        label: 'GEBEN',
        filter: {},
        groupId: null,
        windowMode: 'awake',
        labelPath: ['GEBEN'],
        sort: { by: 'updatedAt', direction: 'desc' },
        groupBy: 'status',
        today: '2026-08-31',
      },
    )

    expect(restored.sort).toEqual({ by: 'updatedAt', direction: 'desc' })
    expect(restored.groupBy).toBe('status')
  })

  it('should keep the params short and readable, so the url can be shared', () => {
    const view = queueViewReducer(INITIAL_VIEW, {
      type: 'add-filter',
      field: 'products',
      values: ['life', 'health'],
    })

    expect(toSearch(view)).toEqual({ node: 'meus-tickets', f: 'products:life,health' })
  })

  it('should omit the defaults, so a clean queue has a clean url', () => {
    expect(toSearch(INITIAL_VIEW)).toEqual({ node: 'meus-tickets' })
  })

  it('should ignore a malformed filter param instead of breaking the queue', () => {
    const restored = fromSearch(
      { node: 'meus-tickets', f: 'lixo::;;produtos' },
      {
        nodeId: 'meus-tickets',
        label: 'Meus tickets',
        filter: { assigneeIds: ['@me'] },
        groupId: null,
        windowMode: 'awake',
        labelPath: ['Meus tickets'],
        sort: { by: 'actionDate', direction: 'asc' },
        today: '2026-08-31',
      },
    )

    expect(restored.filter).toEqual({ assigneeIds: ['@me'] })
  })
})
