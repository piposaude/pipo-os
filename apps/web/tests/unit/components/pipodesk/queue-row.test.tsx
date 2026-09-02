import { render, screen } from '@testing-library/react'
import { QueueRow } from '@/components/pipodesk/queue/QueueRow'
import { queueSeed } from '@/fixtures/pipodesk/dataset'

const columns = [
  { key: 'select', label: '', width: '36px' },
  { key: 'id', label: 'ID.', width: '84px' },
]

const renderRow = (ticket: (typeof queueSeed)[number], cols: typeof columns = columns) =>
  render(
    <table>
      <tbody>
        <QueueRow
          ticket={ticket}
          columns={cols}
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

  /** An action date the API sends in an unexpected shape rendered "em NaNd"
   *  in a neutral chip — a made-up deadline. No reading, no chip. */
  it('should show no deadline chip when the action date cannot be read', () => {
    const withPrazo = [...columns, { key: 'prazo', label: 'Prazo', width: '86px' }]
    renderRow({ ...queueSeed[0], actionDate: 'ontem' }, withPrazo)

    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    // No chip at all: an unreadable date is not a neutral deadline.
    expect(screen.queryByText(/^(hoje|em |—|\d+d)/)).not.toBeInTheDocument()
  })

  it('should still show the deadline chip for a readable action date', () => {
    const withPrazo = [...columns, { key: 'prazo', label: 'Prazo', width: '86px' }]
    renderRow({ ...queueSeed[0], actionDate: '2026-08-01' }, withPrazo)

    expect(screen.getByText('6d')).toBeInTheDocument()
  })
})
