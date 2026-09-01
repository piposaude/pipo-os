// @vitest-environment node
import type { TicketGroup } from '@/lib/pipodesk/group'
import type { TicketRow } from '@/lib/pipodesk/ticket-row'
import { ROW_HEIGHT, computeWindow, flattenGroups, selectionEdges } from '@/lib/pipodesk/virtual'

const ticket = (id: string): TicketRow =>
  ({ id, closedAt: null, actionDate: null, tags: [] }) as unknown as TicketRow

const group = (key: string, label: string, ids: string[]): TicketGroup => ({
  key,
  label,
  tickets: ids.map(ticket),
})

describe('flattenGroups', () => {
  it('should not create a header for the unnamed single group', () => {
    const rows = flattenGroups([group('todos', '', ['a', 'b'])], new Set())

    expect(rows.map((r) => r.kind)).toEqual(['ticket', 'ticket'])
  })

  it('should put a header before each named group', () => {
    const rows = flattenGroups(
      [group('life', 'Vida', ['a']), group('health', 'Saúde', ['b'])],
      new Set(),
    )

    expect(rows.map((r) => r.kind)).toEqual(['group', 'ticket', 'group', 'ticket'])
    expect(rows[0]).toMatchObject({ kind: 'group', label: 'Vida', count: 1, collapsed: false })
  })

  it('should keep the header but drop the rows of a collapsed group', () => {
    const rows = flattenGroups([group('life', 'Vida', ['a', 'b'])], new Set(['life']))

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'group', collapsed: true, count: 2 })
  })
})

describe('computeWindow', () => {
  it('should render a window around the scroll position with overscan', () => {
    const window = computeWindow(1000, ROW_HEIGHT * 20, ROW_HEIGHT * 50)

    expect(window.start).toBeLessThan(50)
    expect(window.end).toBeGreaterThan(70)
    expect(window.padTop).toBe(window.start * ROW_HEIGHT)
  })

  it('should keep the visible range free of overscan, so a header checkbox selects only what is on screen', () => {
    const window = computeWindow(1000, ROW_HEIGHT * 20, ROW_HEIGHT * 50)

    expect(window.visibleStart).toBe(50)
    expect(window.visibleEnd).toBe(70)
    expect(window.visibleStart).toBeGreaterThan(window.start)
    expect(window.visibleEnd).toBeLessThan(window.end)
  })

  it('should never go past the total, nor produce negative padding', () => {
    const window = computeWindow(5, ROW_HEIGHT * 20, 0)

    expect(window.end).toBe(5)
    expect(window.padBottom).toBe(0)
    expect(window.start).toBe(0)
  })
})

describe('selectionEdges', () => {
  it('should mark the first and last row of each contiguous selected run', () => {
    const rows = flattenGroups([group('todos', '', ['a', 'b', 'c', 'd'])], new Set())
    const edges = selectionEdges(rows, new Set(['a', 'b', 'd']))

    expect([...edges.first].sort()).toEqual(['a', 'd'])
    expect([...edges.last].sort()).toEqual(['b', 'd'])
  })

  it('should treat a group header as a break between runs', () => {
    const rows = flattenGroups([group('g1', 'G1', ['a']), group('g2', 'G2', ['b'])], new Set())
    const edges = selectionEdges(rows, new Set(['a', 'b']))

    expect([...edges.first].sort()).toEqual(['a', 'b'])
    expect([...edges.last].sort()).toEqual(['a', 'b'])
  })
})
