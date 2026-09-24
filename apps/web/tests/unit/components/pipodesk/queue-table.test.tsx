import { render, screen, within } from '@testing-library/react'
import { QueueTable } from '@/components/pipodesk/queue/QueueTable'
import { FILTER_BY_COLUMN, SORTABLE } from '@/lib/pipodesk/columns'
import type { TicketGroup } from '@/lib/pipodesk/group'
import { queueSeed } from '../../../fixtures/pipodesk/dataset'
import constants from '@/constants/pages/pipodesk/queue'

const columns = [
  { key: 'select', label: '', width: '36px' },
  { key: 'id', label: 'ID.', width: '84px' },
]

const table = (groups: TicketGroup[], selectedIds: string[] = []) => (
  <QueueTable
    groups={groups}
    columns={columns}
    sort={{ by: 'actionDate', direction: 'asc' }}
    onSort={() => {}}
    collapsedGroups={[]}
    onToggleGroup={() => {}}
    selectedIds={selectedIds}
    onToggleTicket={() => {}}
    onSelectAll={() => {}}
    onOpenTicket={() => {}}
    today="2026-08-07"
    resolveName={(id) => id}
  />
)

const threeRows = [{ key: 'all', label: '', tickets: queueSeed.slice(0, 3) }]

describe('QueueTable', () => {
  /** The scroll box carries the ref the ResizeObserver watches. Replacing it
   *  with the empty state left the queue with no observer at all when it opened
   *  empty — the viewport height froze at the default and the virtual window
   *  drew a fixed handful of rows over a blank screen. */
  it('should measure the scroll box even when the queue opens empty', () => {
    const observed: Element[] = []
    class RecordingResizeObserver {
      observe(element: Element) {
        observed.push(element)
      }
      unobserve() {}
      disconnect() {}
    }
    // Save and restore this one global: `vi.unstubAllGlobals()` would also drop
    // the `Request` stub `tests/setup.ts` installs for every later test.
    const NativeResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = RecordingResizeObserver as unknown as typeof ResizeObserver

    const { rerender } = render(table([]))
    expect(screen.getByText(constants.empty.title)).toBeInTheDocument()

    rerender(table([{ key: 'all', label: '', tickets: queueSeed.slice(0, 3) }]))

    expect(observed).toContain(screen.getByRole('table').parentElement)
    globalThis.ResizeObserver = NativeResizeObserver
  })

  /** With a partial selection the header checkbox rendered unchecked, so the
   *  screen reader announced "nothing selected" while the batch bar said
   *  "N selecionados". */
  it('should mark the select-all checkbox as indeterminate on a partial selection', () => {
    render(table(threeRows, [queueSeed[0].id]))

    const selectAll = screen.getByRole('checkbox', { name: constants.selectAll })
    expect((selectAll as HTMLInputElement).indeterminate).toBe(true)
    expect(selectAll).not.toBeChecked()
  })

  it('should be checked, not indeterminate, once every row is selected', () => {
    render(
      table(
        threeRows,
        queueSeed.slice(0, 3).map((ticket) => ticket.id),
      ),
    )

    const selectAll = screen.getByRole('checkbox', { name: constants.selectAll })
    expect((selectAll as HTMLInputElement).indeterminate).toBe(false)
    expect(selectAll).toBeChecked()
  })
})

/**
 * A panel is wider than most columns, so it must open toward the side of the
 * table that has room: to the right of a funnel in the left half, to the left
 * of a funnel in the right half. Position, not column key — the person can
 * reorder columns.
 */
describe('column funnel side', () => {
  it('should hand the funnel the side its panel opens toward, by column position', () => {
    const sides: Record<string, string> = {}
    render(
      <QueueTable
        groups={threeRows}
        columns={[
          { key: 'select', label: '', width: '36px' },
          { key: 'id', label: 'ID.', width: '84px' },
          { key: 'classification', label: 'Classificação', width: '132px' },
          { key: 'company', label: 'Empresa', width: '190px' },
          { key: 'status', label: 'Status', width: '150px' },
          { key: 'relationship', label: 'Vínculo', width: '104px' },
        ]}
        sort={{ by: 'actionDate', direction: 'asc' }}
        onSort={() => {}}
        collapsedGroups={[]}
        onToggleGroup={() => {}}
        selectedIds={[]}
        onToggleTicket={() => {}}
        onSelectAll={() => {}}
        onOpenTicket={() => {}}
        today="2026-08-07"
        resolveName={(id) => id}
        columnFilter={(field, align) => {
          sides[field] = align
          return null
        }}
      />,
    )

    expect(sides).toEqual({ priorities: 'left', types: 'left', relationships: 'right' })
  })
})

/**
 * The rule the header design rests on: a column either sorts or it filters,
 * never both. It is stated in a comment on FILTER_BY_COLUMN; this is what
 * keeps a future column from quietly getting two controls.
 */
describe('sort and filter are exclusive', () => {
  it('should give no column both a sort arrow and a funnel', () => {
    const both = Object.keys(FILTER_BY_COLUMN).filter((key) => key in SORTABLE)
    expect(both).toEqual([])
  })
})

/**
 * The hover explanation belongs to the label, not to the whole header cell:
 * with the funnel inside the titled box, a column carrying both would nest two
 * tooltips and the inner one would win by depth alone.
 */
describe('header cell', () => {
  it('should keep the funnel outside the element that carries the title', () => {
    render(
      <QueueTable
        groups={threeRows}
        columns={[
          { key: 'select', label: '', width: '36px' },
          { key: 'classification', label: 'Classificação', width: '132px', title: 'o que é' },
        ]}
        sort={{ by: 'actionDate', direction: 'asc' }}
        onSort={() => {}}
        collapsedGroups={[]}
        onToggleGroup={() => {}}
        selectedIds={[]}
        onToggleTicket={() => {}}
        onSelectAll={() => {}}
        onOpenTicket={() => {}}
        today="2026-08-07"
        resolveName={(id) => id}
        columnFilter={() => <button type="button">funil</button>}
      />,
    )

    const titled = document.querySelector('[title="o que é"]')
    expect(titled).not.toBeNull()
    expect(titled?.textContent).toContain('Classificação')
    expect(within(titled as HTMLElement).queryByRole('button', { name: 'funil' })).toBeNull()
    // ...and the funnel is still on screen, in the cell next to the label.
    expect(screen.getByRole('button', { name: 'funil' })).toBeInTheDocument()
  })

  /** A `title` on a bare span is a mouse tooltip and nothing else; on the sort
   *  button it is also the accessible description a screen reader announces. */
  it('should hang the title on the sort button when the column sorts', () => {
    render(
      <QueueTable
        groups={threeRows}
        columns={[
          { key: 'select', label: '', width: '36px' },
          { key: 'prazo', label: 'Prazo', width: '86px', align: 'right', title: 'o que é' },
        ]}
        sort={{ by: 'actionDate', direction: 'asc' }}
        onSort={() => {}}
        collapsedGroups={[]}
        onToggleGroup={() => {}}
        selectedIds={[]}
        onToggleTicket={() => {}}
        onSelectAll={() => {}}
        onOpenTicket={() => {}}
        today="2026-08-07"
        resolveName={(id) => id}
      />,
    )

    expect(screen.getByRole('button', { name: /Prazo/ })).toHaveAttribute('title', 'o que é')
  })
})
