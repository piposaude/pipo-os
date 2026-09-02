import { render, screen } from '@testing-library/react'
import { QueueTable } from '@/components/pipodesk/queue/QueueTable'
import type { TicketGroup } from '@/lib/pipodesk/group'
import { queueSeed } from '@/fixtures/pipodesk/dataset'
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
