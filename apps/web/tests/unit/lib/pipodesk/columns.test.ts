// @vitest-environment node
import {
  DEFAULT_COLUMN_PREFS,
  FLEX_COLUMN,
  MIN_COLUMN_WIDTH,
  applyColumnPrefs,
  columnsFor,
  isResizable,
  moveColumn,
  type QueueColumn,
} from '@/lib/pipodesk/columns'

const keys = (columns: QueueColumn[]): string[] => columns.map((c) => c.key)

describe('columnsFor', () => {
  it('should drop the owner column when the queue is pinned to a single owner', () => {
    expect(keys(columnsFor(true))).toContain('assignee')
    expect(keys(columnsFor(false))).not.toContain('assignee')
  })

  it('should always start with the selection column', () => {
    expect(keys(columnsFor(true))[0]).toBe('select')
  })
})

describe('applyColumnPrefs', () => {
  const base = columnsFor(true)

  it('should hide the two date columns by default', () => {
    expect(DEFAULT_COLUMN_PREFS.hidden).toEqual(['createdAt', 'updatedAt'])
    expect(keys(applyColumnPrefs(base, DEFAULT_COLUMN_PREFS))).not.toContain('createdAt')
  })

  it('should keep the fixed selection column even if someone asks to hide it', () => {
    const columns = applyColumnPrefs(base, { ...DEFAULT_COLUMN_PREFS, hidden: ['select'] })

    expect(keys(columns)).toContain('select')
  })

  it('should follow the preferred order for the visible columns', () => {
    const columns = applyColumnPrefs(base, {
      ...DEFAULT_COLUMN_PREFS,
      order: [
        'company',
        'subject',
        'id',
        'assignee',
        'classification',
        'vinculo',
        'status',
        'createdAt',
        'updatedAt',
        'prazo',
      ],
    })

    expect(keys(columns).slice(0, 4)).toEqual(['select', 'company', 'subject', 'id'])
  })

  it('should apply the widths the person dragged and respect the minimum', () => {
    const columns = applyColumnPrefs(base, {
      ...DEFAULT_COLUMN_PREFS,
      widths: { company: 300, vinculo: 10 },
    })

    expect(columns.find((c) => c.key === 'company')?.width).toBe('300px')
    expect(columns.find((c) => c.key === 'vinculo')?.width).toBe(`${MIN_COLUMN_WIDTH}px`)
  })

  it('should never give the flex column a fixed width, since it absorbs the leftover', () => {
    const columns = applyColumnPrefs(base, {
      ...DEFAULT_COLUMN_PREFS,
      widths: { [FLEX_COLUMN]: 500 },
    })

    expect(columns.find((c) => c.key === FLEX_COLUMN)?.width).toBe('auto')
  })
})

describe('moveColumn', () => {
  it('should swap with the next VISIBLE column, skipping the hidden ones', () => {
    const order = ['id', 'assignee', 'subject', 'company']
    const visible = ['id', 'subject', 'company']

    expect(moveColumn(order, visible, 'id', 1)).toEqual(['assignee', 'subject', 'id', 'company'])
  })

  it('should not move the first column left, nor the last right', () => {
    const order = ['id', 'subject']
    const visible = ['id', 'subject']

    expect(moveColumn(order, visible, 'id', -1)).toEqual(order)
    expect(moveColumn(order, visible, 'subject', 1)).toEqual(order)
  })

  it('should be a no-op for a column that is not visible right now', () => {
    const order = ['id', 'assignee', 'subject']
    const visible = ['id', 'subject']

    expect(moveColumn(order, visible, 'assignee', 1)).toEqual(order)
  })
})

describe('isResizable', () => {
  it('should refuse the fixed and the flex columns', () => {
    expect(isResizable('select')).toBe(false)
    expect(isResizable(FLEX_COLUMN)).toBe(false)
    expect(isResizable('company')).toBe(true)
  })
})
