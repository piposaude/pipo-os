import { render, screen } from '@testing-library/react'
import { QueueTable } from '@/components/pipodesk/queue/QueueTable'
import type { TicketGroup } from '@/lib/pipodesk/group'
import { queueSeed } from '@/fixtures/pipodesk/dataset'
import constants from '@/constants/pages/pipodesk/queue'

const columns = [
  { key: 'select', label: '', width: '36px' },
  { key: 'id', label: 'ID.', width: '84px' },
]

const table = (groups: TicketGroup[]) => (
  <QueueTable
    groups={groups}
    columns={columns}
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
  />
)

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
})
