import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterPopover } from '@/components/pipodesk/queue/FilterPopover'
import type { TicketFilter } from '@/lib/pipodesk/filter'
import { queueViewReducer, type QueueView } from '@/lib/pipodesk/queue-view'
import { queueSeed } from '@/fixtures/pipodesk/dataset'

const ctx = {
  companyName: (id: string) => id,
  carrierName: (id: string) => id,
  userName: (id: string) => id,
}

/** The dataset has no ticket without a contract; the API contract admits one
 *  (`contractType: string | null`) and MOV PJ filters `['pj', null]`. */
const base = [
  { ...queueSeed[0], id: 'ticket-pj', contractType: 'pj' },
  { ...queueSeed[1], id: 'ticket-clt', contractType: 'clt' },
  { ...queueSeed[2], id: 'ticket-sem', contractType: null },
]

async function openField(
  filter: TicketFilter,
  handlers: Partial<Parameters<typeof FilterPopover>[0]> = {},
) {
  const onApply = vi.fn()
  const onRemove = vi.fn()
  render(
    <FilterPopover
      open
      onClose={() => {}}
      base={base}
      filter={filter}
      viewerId="user-15"
      ctx={ctx}
      onApply={onApply}
      onRemove={onRemove}
      dateWindowDays={null}
      onSetDateWindow={() => {}}
      {...handlers}
    />,
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Contrato' }))
  return { user, onApply, onRemove }
}

describe('FilterPopover', () => {
  /** `'livre'` was hardcoded as the null sentinel for every field, but only
   *  `assigneeIds` uses it — `contractTypes` and `priorities` use `'sem'`. */
  it('should count the tickets with no contract under their own option', async () => {
    await openField({})

    expect(screen.getByRole('button', { name: /^Sem contrato/ })).toHaveTextContent(
      /Sem contrato\s*1/,
    )
  })

  it('should show the null option as active when the filter already carries null', async () => {
    await openField({ contractTypes: ['pj', null] })

    expect(screen.getByRole('button', { name: /^Sem contrato/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  /** The emitted values cross the reducer before reaching the filter: the
   *  wrong sentinel survived as a literal and dropped every null-contract
   *  ticket from the queue in silence. */
  it('should keep null in the filter when another option is added', async () => {
    const { user, onApply } = await openField({ contractTypes: ['pj', null] })

    await user.click(screen.getByRole('button', { name: /^CLT/ }))

    expect(onApply).toHaveBeenCalledTimes(1)
    const [field, values] = onApply.mock.calls[0]
    const view = { filter: {}, nodeFilter: {} } as QueueView
    const next = queueViewReducer(view, { type: 'add-filter', field, values })
    expect(next.filter.contractTypes).toEqual(expect.arrayContaining(['pj', 'clt', null]))
  })

  /** Unchecking the last option wrote `[]`, which `matchesFilter` reads as
   *  "no restriction": in MOV PJ the node's own cut vanished while the
   *  breadcrumb still announced it. */
  it('should ask for the field to be removed when the last option is unchecked', async () => {
    const { user, onApply, onRemove } = await openField({ contractTypes: ['pj'] })

    await user.click(screen.getByRole('button', { name: /^PJ/ }))

    expect(onRemove).toHaveBeenCalledWith('contractTypes')
    expect(onApply).not.toHaveBeenCalled()
  })
})
