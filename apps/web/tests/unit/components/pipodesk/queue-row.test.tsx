import { render, screen } from '@testing-library/react'
import { QueueRow } from '@/components/pipodesk/queue/QueueRow'
import { queueSeed } from '@/fixtures/pipodesk/dataset'

const columns = [
  { key: 'select', label: '', width: '36px' },
  { key: 'id', label: 'ID.', width: '84px' },
]

const renderRow = (ticket: (typeof queueSeed)[number]) =>
  render(
    <table>
      <tbody>
        <QueueRow
          ticket={ticket}
          columns={columns}
          selected={false}
          onToggleSelect={() => {}}
          today="2026-08-07"
          resolveName={(id) => id}
        />
      </tbody>
    </table>,
  )

describe('QueueRow', () => {
  /** The ID column is the number the analyst reads out loud on a call — the
   *  operational one from the API (PD-011), not the internal key. */
  it('should show the operational number when the ticket has one', () => {
    renderRow({ ...queueSeed[0], id: 'ticket-1', displayNumber: 'M000123' })

    expect(screen.getByRole('cell', { name: 'M000123' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(/M000123/)
  })

  it('should fall back to the internal id while the API sends no number', () => {
    renderRow({ ...queueSeed[0], id: 'ticket-1', displayNumber: null })

    expect(screen.getByRole('cell', { name: 'ticket-1' })).toBeInTheDocument()
  })
})
